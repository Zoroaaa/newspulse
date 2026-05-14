# NewsPulse 技术文档

> 📖 本文档提供 NewsPulse 项目的完整技术细节，包括架构设计、API 参考、开发指南等。

---

## 目录

- [系统架构](#系统架构)
- [数据库设计](#数据库设计)
- [API 完整参考](#api-完整参考)
- [核心模块详解](#核心模块详解)
- [配置参考](#配置参考)
- [部署指南](#部署指南)
- [开发指南](#开发指南)
- [性能优化](#性能优化)
- [故障排查](#故障排查)

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐│
│  │   首页 SPA   │  │ Admin 后台   │  │    PWA (离线支持)    ││
│  │ (多视图切换) │  │ (密码保护)    │  │  Service Worker     ││
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘│
└─────────┼────────────────┼─────────────────────┼───────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      API 路由层                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ /articles│ │ /feeds   │ │ /search  │ │ /admin-*       │ │
│  │ /trending│ │ /config  │ │ /cron    │ │ /proxy/image   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬────────┘ │
└───────┼────────────┼────────────┼──────────────┼───────────┘
        │            │            │              │
        ▼            ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                       业务逻辑层                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ RSS 解析器│ │ AI 集成层 │ │ 抓取引擎 │ │ 认证 & 权限    │ │
│  │rss-parser│ │   ai.ts  │ │crawl-utils│ │    auth.ts     │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       数据持久层                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Turso (libSQL) / 本地 SQLite                         │   │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ feeds  │ │ articles │ │ config   │ │ stats     │  │   │
│  │  └────────┘ └──────────┘ └──────────┘ └───────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```
1. 定时触发 (Cron / 手动)
       ↓
2. 获取启用的 RSS 源列表
       ↓
3. 并发抓取各源 (Promise.allSettled)
       ↓
4. 解析 RSS/Atom XML → 结构化数据
       ↓
5. 相似度去重 (similarity.ts)
       ↓
6. 写入数据库 (Drizzle ORM)
       ↓
7. 可选：AI 摘要/翻译
       ↓
8. 用户请求 → API → 查询数据库 → 返回前端
```

### 技术选型理由

| 决策点 | 选择 | 原因 |
|--------|------|------|
| **框架** | Next.js App Router | SSR/SSG 支持、API Routes、文件系统路由 |
| **数据库** | Turso + SQLite | 边缘友好、免费额度大、SQLite 兼容 |
| **ORM** | Drizzle ORM | 类型安全、轻量、SQL-like 语法 |
| **UI 方案** | Tailwind CSS | 原子化 CSS、快速开发、体积小 |
| **AI SDK** | 原生 fetch | 避免重量级依赖、灵活适配多厂商 |

---

## 数据库设计

### ER 图

```
┌─────────────────┐       ┌───────────────────┐
│      feeds      │       │     articles      │
├─────────────────┤       ├───────────────────┤
│ PK id           │───┐   │ PK id             │
│    name         │   │   │ FK feed_id        │──┘
│    url (UNIQUE) │   │   │    title          │
│    topic        │   │   │    title_zh       │
│    enabled      │   │   │    url (UNIQUE)   │
│    is_builtin   │   │   │    summary        │
│    consecutive_ │   │   │    image_url      │
│    errors       │   │   │    source         │
│    last_error   │   │   │    topic          │
│    last_success │   │   │    published_at   │
│    created_at   │   │   │    created_at     │
└─────────────────┘   │   └───────────────────┘
                     │             │
                     │             │ 1
                     │             │
                     │             ▼
                     │   ┌───────────────────┐
                     │   │   article_views    │
                     │   ├───────────────────┤
                     │   │ FK article_id      │──┐
                     │   │    viewed_at       │  │
                     │   └───────────────────┘  │
                     │                          │
┌─────────────────┐   │                          │
│      config     │   │   ┌──────────────────────┴──┐
├─────────────────┤   │   │   site_access_stats      │
│ PK key          │   │   ├──────────────────────────┤
│    value        │   │   │ PK id                    │
│    updated_at   │   │   │    visited_at             │
└─────────────────┘   │   │    user_agent             │
                     │   │    referrer               │
                     │   └──────────────────────────┘
                     │
                     └──→ N
```

### 表结构详细说明

#### `feeds` - RSS 源表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | INTEGER | PRIMARY KEY, AUTO INCREMENT | 自增主键 |
| `name` | TEXT | NOT NULL | 源名称（如 "TechCrunch"） |
| `url` | TEXT | NOT NULL, UNIQUE | RSS Feed URL |
| `topic` | TEXT | NOT NULL | 主题分类（如 "tech", "world"） |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | 是否启用 |
| `is_builtin` | BOOLEAN | NOT NULL, DEFAULT false | 是否为内置源 |
| `consecutive_errors` | INTEGER | NOT NULL, DEFAULT 0 | 连续错误次数 |
| `last_error` | TEXT | NULLABLE | 最后一次错误信息 |
| `last_success` | TIMESTAMP | NULLABLE | 最后成功抓取时间 |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | 创建时间 |

**索引建议**：
```sql
CREATE INDEX idx_feeds_enabled ON feeds(enabled);
CREATE INDEX idx_feeds_topic ON feeds(topic);
```

#### `articles` - 文章表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | INTEGER | PRIMARY KEY, AUTO INCREMENT | 自增主键 |
| `feed_id` | INTEGER | NOT NULL, FK → feeds.id | 关联的 RSS 源 |
| `title` | TEXT | NOT NULL | 原始标题（通常为英文） |
| `title_zh` | TEXT | NULLABLE | 中文翻译标题 |
| `url` | TEXT | NOT NULL, UNIQUE | 文章原文 URL |
| `summary` | TEXT | NULLABLE | AI 生成的摘要 |
| `image_url` | TEXT | NULLABLE | 封面图片 URL |
| `source` | TEXT | NOT NULL | 来源名称 |
| `topic` | TEXT | NOT NULL | 主题分类 |
| `published_at` | TIMESTAMP | NULLABLE | 原文发布时间 |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | 入库时间 |

**索引建议**：
```sql
CREATE INDEX idx_articles_feed_id ON articles(feed_id);
CREATE INDEX idx_articles_topic ON articles(topic);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_created ON articles(created_at DESC);
```

#### `article_views` - 浏览记录表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `article_id` | INTEGER | NOT NULL, FK → articles.id | 关联文章 ID |
| `viewed_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | 浏览时间 |

**复合主键**：`(article_id, viewed_at)` 用于防止重复记录

#### `config` - 配置表（KV 存储）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `key` | TEXT | PRIMARY KEY | 配置键名 |
| `value` | TEXT | NOT NULL | 配置值 |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | 最后更新时间 |

**预置配置项**：

| key | 说明 | 示例值 |
|-----|------|--------|
| `ai_provider` | AI 提供商 | `"openai"` / `"anthropic"` / `"custom"` |
| `ai_model` | AI 模型名 | `"gpt-4o-mini"` |
| `ai_api_key` | API 密钥 | `"sk-xxx"` |
| `ai_base_url` | 自定义端点 | `"https://..."` |
| `summary_lang` | 摘要语言 | `"zh"` / `"en"` |
| `summary_length` | 摘要长度 | `"short"` / `"standard"` / `"long"` |

#### `site_access_stats` - 站点访问统计

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | INTEGER | PRIMARY KEY, AUTO INCREMENT | 自增主键 |
| `visited_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | 访问时间 |
| `user_agent` | TEXT | NULLABLE | 浏览器 UA |
| `referrer` | TEXT | NULLABLE | 来源页面 |

---

## API 完整参考

### 基础信息

- **Base URL**: `/api`
- **认证方式**: Admin 接口使用密码认证（Cookie-based）
- **数据格式**: JSON
- **字符编码**: UTF-8

---

### 文章接口

#### `GET /api/articles`

获取文章列表，支持多种查询模式。

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `topic` | string | 否 | - | 按主题筛选 |
| `offset` | integer | 否 | 0 | 分页偏移量 |
| `limit` | integer | 否 | 6 | 每页数量（最大 50） |
| `count` | boolean | 否 | false | 是否只返回总数 |

**响应示例（默认模式 - 按 Topic 分组）**：

```json
{
  "tech": [
    {
      "id": 1,
      "title": "OpenAI Releases GPT-5",
      "titleZh": "OpenAI 发布 GPT-5",
      "url": "https://...",
      "summary": "...",
      "imageUrl": "https://...",
      "source": "TechCrunch",
      "topic": "tech",
      "publishedAt": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-15T12:00:00Z",
      "viewCount": 42
    }
  ],
  "world": [...]
}
```

**响应示例（topic 筛选模式）**：

```json
{
  "rows": [...],
  "hasMore": true,
  "total": 100
}
```

**响应示例（count 模式）**：

```json
{
  "total": 1234
}
```

**错误响应**：

```json
{
  "error": "Database connection failed"
}
```

---

#### `GET /api/articles/[id]`

获取单篇文章详情。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 文章 ID |

**响应示例**：

```json
{
  "id": 1,
  "title": "Article Title",
  "titleZh": "中文标题",
  "url": "https://example.com/article",
  "summary": "文章摘要内容...",
  "imageUrl": "https://...",
  "source": "Source Name",
  "topic": "tech",
  "publishedAt": "2024-01-15T10:30:00Z",
  "createdAt": "2024-01-15T12:00:00Z"
}
```

**状态码**：
- `200`: 成功
- `404`: 文章不存在
- `500`: 服务器错误

---

#### `POST /api/articles/translate`

批量翻译文章标题。

**请求体**：

```json
{
  "ids": [1, 2, 3, 4, 5]
}
```

**响应**：

```json
{
  "translated": 3,
  "failed": 2,
  "errors": {
    "2": "Rate limit exceeded",
    "4": "Invalid article ID"
  }
}
```

**说明**：
- 使用当前配置的 AI Provider 进行翻译
- 批量处理，最多支持 20 个 ID
- 已有翻译的文章会跳过
- 失败的条目会记录在 `errors` 对象中

---

#### `POST /api/articles/translate/view`

获取单篇文章的全文翻译。

**请求体**：

```json
{
  "id": 1,
  "url": "https://example.com/article"
}
```

**响应**：

```json
{
  "originalText": "The original article content in English...",
  "translatedText": "翻译后的中文内容...",
  "title": "Original Title",
  "titleZh": "中文标题"
}
```

**流程**：
1. 根据 URL 抓取原文（使用 cheerio 解析 HTML）
2. 提取正文内容（去除广告、导航等噪音）
3. 调用 AI 进行全文翻译
4. 返回原文和译文

**超时设置**：
- 抓取原文：15 秒
- AI 翻译：30 秒
- 总计最长：45 秒

---

### RSS 源管理接口

#### `GET /api/feeds`

获取所有 RSS 源列表。

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | boolean | 否 | - | 是否只返回启用的源 |

**响应示例**：

```json
[
  {
    "id": 1,
    "name": "TechCrunch",
    "url": "https://techcrunch.com/feed/",
    "topic": "tech",
    "enabled": true,
    "isBuiltin": true,
    "consecutiveErrors": 0,
    "lastError": null,
    "lastSuccess": "2024-01-15T12:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

---

#### `POST /api/feeds` (Admin)

添加新的 RSS 源。

**请求体**：

```json
{
  "name": "My Blog",
  "url": "https://myblog.com/rss.xml",
  "topic": "tech"
}
```

**响应**：

```json
{
  "id": 18,
  "name": "My Blog",
  "url": "https://myblog.com/rss.xml",
  "topic": "tech",
  "enabled": true,
  "isBuiltin": false,
  "consecutiveErrors": 0,
  "lastError": null,
  "lastSuccess": null,
  "createdAt": "2024-01-15T12:00:00Z"
}
```

**验证规则**：
- `name`: 必填，长度 1-100
- `url`: 必填，必须是合法的 URL
- `topic`: 必填，预定义值之一或自定义

---

#### `PUT /api/feeds/[id]` (Admin)

更新 RSS 源配置。

**请求体**：

```json
{
  "enabled": false,
  "name": "Updated Name"
}
```

**响应**：更新后的源对象

---

#### `DELETE /api/feeds/[id]` (Admin)

删除 RSS 源。

**注意**：内置源（isBuiltin=true）不可删除，只能禁用。

**响应**：

```json
{
  "success": true,
  "message": "Feed deleted successfully"
}
```

---

### 搜索接口

#### `GET /api/search?q=keyword`

搜索文章（模糊匹配标题）。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | ✅ | 搜索关键词（最少 2 字符） |
| `limit` | integer | 否 | 返回数量（默认 20，最大 50） |

**响应示例**：

```json
{
  "results": [
    {
      "id": 1,
      "title": "AI Breakthrough in 2024",
      "titleZh": "2024 年 AI 重大突破",
      "source": "TechCrunch",
      "topic": "tech",
      "publishedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 5,
  "query": "AI breakthrough"
}
```

**搜索逻辑**：
- 同时搜索 `title` 和 `title_zh` 字段
- 使用 SQLite 的 LIKE 操作符（大小写不敏感）
- 按发布时间倒序排列

---

### 热门推荐接口

#### `GET /api/trending`

获取热门文章（基于浏览量）。

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `period` | string | 否 | "7d" | 时间范围：24h / 7d / 30d / all |
| `limit` | integer | 否 | 10 | 返回数量 |

**响应示例**：

```json
[
  {
    "id": 1,
    "title": "Most Popular Article",
    "viewCount": 1523,
    "topic": "tech",
    "publishedAt": "2024-01-15T10:30:00Z"
  }
]
```

**算法**：
- 统计指定时间范围内的浏览次数
- 按浏览量降序排列
- 缓存结果 5 分钟（避免频繁查询）

---

### 配置接口

#### `GET /api/config/public`

获取公开配置（无需认证）。

**响应**：

```json
{
  "aiProvider": "openai",
  "aiModel": "gpt-4o-mini",
  "summaryLang": "zh",
  "siteName": "NewsPulse",
  "siteDescription": "AI-powered news aggregator"
}
```

**敏感信息过滤**：不会返回 `apiKey` 等敏感字段

---

#### `GET /api/config` (Admin)

获取完整配置（包含敏感信息）。

**需要认证**：Header 中需携带有效的 Admin Cookie

**响应**：

```json
{
  "ai_provider": "openai",
  "ai_model": "gpt-4o-mini",
  "ai_api_key": "sk-xxx",
  "ai_base_url": null,
  "summary_lang": "zh",
  "summary_length": "standard"
}
```

---

#### `PUT /api/config` (Admin)

更新系统配置。

**请求体**：

```json
{
  "ai_provider": "anthropic",
  "ai_model": "claude-3-haiku-20240307",
  "ai_api_key": "sk-ant-new-key",
  "summary_lang": "en"
}
```

**响应**：

```json
{
  "success": true,
  "updatedKeys": ["ai_provider", "ai_model", "ai_api_key", "summary_lang"],
  "message": "Configuration updated successfully"
}
```

**特殊处理**：
- 更新 AI 相关配置后，下次调用时立即生效
- `ai_api_key` 会进行格式验证（非空检查）
- 不允许通过此接口修改 `admin_password`

---

### Admin 认证接口

#### `POST /api/admin-login`

管理员登录验证。

**请求体**：

```json
{
  "password": "your-admin-password"
}
```

**响应（成功）**：

```json
{
  "success": true,
  "token": "random-session-token",
  "expiresIn": 86400
}
```

**响应（失败）**：

```json
{
  "success": false,
  "error": "Invalid password"
}
```

**安全机制**：
- 密码使用环境变量中的 `ADMIN_PASSWORD` 验证
- 不存储明文密码，仅做比对
- Token 有效期：24 小时
- 登录失败次数限制：连续 5 次失败后锁定 15 分钟

---

### Cron 任务接口

#### `GET /api/cron?secret=xxx`

定时任务触发端点（Vercel Cron 或手动调用）。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `secret` | string | ✅ | CRON_SECRET 环境变量的值 |

**响应**：

```json
{
  "success": true,
  "crawledFeeds": 17,
  "newArticles": 142,
  "errors": 2,
  "duration": "23.5s",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

**执行流程**：
1. 验证 secret 参数
2. 查询所有 enabled 的 RSS 源
3. 并发抓取（Promise.allSettled，最大并发 5）
4. 解析并去重
5. 写入数据库
6. 更新源状态（成功/失败计数）
7. 返回统计信息

**错误处理**：
- 单个源失败不影响其他源
- 连续失败 10 次自动禁用该源
- 错误信息记录到 `feeds.last_error`

---

#### `POST /api/admin-crawl` (Admin)

手动触发抓取（与 Cron 相同逻辑，但需认证）。

**可选参数**：

```json
{
  "feedIds": [1, 2, 3]  // 可选：只抓取指定源
}
```

---

### 图片代理接口

#### `GET /api/proxy/image?url=encoded-url`

图片代理（解决跨域和防盗链问题）。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | ✅ | 需要代理的图片 URL（需 URL 编码） |

**响应**：
- Content-Type: 自动检测（image/jpeg, image/png 等）
- Cache-Control: public, max-age=86400 (缓存 24 小时)
- 图片二进制流

**功能**：
- 绕过跨域限制
- 解决 Referer 防盗链
- 自动压缩（如果原图 > 500KB）
- 支持常见图片格式：JPEG, PNG, GIF, WebP, SVG

---

### OPML 导出接口

#### `POST /api/opml`

导出 OPML 文件（用于导入其他阅读器）。

**请求体**（可选）：

```json
{
  "includeDisabled": false  // 是否包含禁用的源
}
```

**响应**：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>NewsPulse Feeds</title>
    <dateCreated>Mon, 15 Jan 2024 12:00:00 GMT</dateCreated>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="TechCrunch" title="TechCrunch"
               type="rss" xmlUrl="https://techcrunch.com/feed/"
               htmlUrl="https://techcrunch.com"/>
    </outline>
  </body>
</opml>
```

**Content-Type**: application/xml

---

### 访问统计接口

#### `POST /api/site-stats/visit`

记录站点访问（前端自动调用）。

**请求体**：

```json
{
  "userAgent": "Mozilla/5.0 ...",
  "referrer": "https://google.com"
}
```

**响应**：

```json
{
  "success": true
}
```

**隐私保护**：
- 仅记录 User-Agent 和 Referrer
- 不记录 IP 地址
- 不记录用户身份信息
- 符合 GDPR 最小化原则

---

#### `GET /api/site-stats`

获取访问统计（Admin 接口）。

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `period` | string | 否 | "7d" | 时间范围 |
| `groupBy` | string | 否 | "day" | 分组维度：hour / day / week / month |

**响应示例**：

```json
{
  "period": "7d",
  "totalVisits": 1234,
  "uniqueDays": 7,
  "data": [
    { "date": "2024-01-09", "visits": 156 },
    { "date": "2024-01-10", "visits": 189 },
    ...
  ],
  "topReferrers": [
    { "referrer": "https://google.com", "count": 234 },
    { "referrer": "https://twitter.com", "count": 89 }
  ]
}
```

---

## 核心模块详解

### AI 集成层 (`src/lib/ai.ts`)

**职责**：统一封装多个 AI 提供商的调用逻辑。

**核心类/函数**：

```typescript
interface AIConfig {
  provider: 'openai' | 'anthropic' | 'custom'
  model: string
  apiKey: string
  baseUrl?: string
  summaryLang: string  // 'zh' | 'en'
  summaryLength: string // 'short' | 'standard' | 'long'
}

// 获取当前 AI 配置（从 DB 或环境变量）
async function getAIConfig(): Promise<AIConfig>

// 核心调用方法
async function callAIWithConfig(
  cfg: AIConfig,
  systemPrompt: string,
  userContent: string,
  timeoutMs?: number,    // 默认 30000ms
  maxTokens?: number      // 默认 1024
): Promise<string>

// 便捷方法（自动加载配置）
async function translateTitles(titles: string[]): Promise<string[]>
async function summarizeArticle(content: string): Promise<string>
async function translateFullText(text: string): Promise<string>
```

**Provider 适配逻辑**：

```typescript
if (cfg.provider === 'anthropic') {
  // Anthropic Messages API
  endpoint: `${baseUrl}/messages`
  headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  body: { model, max_tokens, system, messages }
} else {
  // OpenAI Chat Completions API (兼容格式)
  endpoint: `${baseUrl}/chat/completions`
  headers: { 'Authorization': `Bearer ${apiKey}` }
  body: { model, max_tokens, messages }
}
```

**错误处理**：
- 超时控制：使用 `AbortSignal.timeout()`
- 重试机制：暂未实现（可按需添加）
- 错误传播：抛出原始错误信息

---

### RSS 解析器 (`src/lib/rss-parser.ts`)

**职责**：解析 RSS/Atom 格式的 XML 数据。

**支持的格式**：
- RSS 2.0 (`<rss><channel><item>`)
- Atom 1.0 (`<feed><entry>`)
- RDF 1.0 (`<rdf:RDF><item>`)

**核心函数**：

```typescript
interface ParsedArticle {
  title: string
  url: string
  summary: string
  imageUrl: string | null
  publishedAt: Date | null
}

async function parseFeed(url: string, limit?: number): Promise<ParsedArticle[]>
```

**图片提取优先级**：

1. `<media:content url="...">`
2. `<media:thumbnail url="...">`
3. `<enclosure url="..." type="image/*">`
4. `<description>` 中的 `<img src="...">`
5. `<content:encoded>` 中的 `<img src="...">`

**文本提取逻辑**：
- 处理 Atom 的嵌套结构（如 `<link href="...">`）
- 清理 HTML 标签（保留纯文本）
- 截断摘要至 300 字符

**容错机制**：
- 10 秒超时
- 自定义 User-Agent
- 宽松的 XML 解析器配置
- 缺失字段使用默认值

---

### 抓取工具 (`src/lib/crawl-utils.ts`)

**职责**：协调 RSS 抓取、去重、入库的全流程。

**主要函数**：

```typescript
interface CrawlResult {
  feedId: number
  success: boolean
  newArticles: number
  error?: string
  duration: number
}

async function crawlAllFeeds(): Promise<CrawlResult[]>
async function crawlSingleFeed(feedId: number): Promise<CrawlResult>
```

**执行策略**：

```typescript
// 1. 获取启用的源
const feeds = await db.select().from(feeds).where(eq(feeds.enabled, true))

// 2. 并发控制（最多 5 个同时抓取）
const results = await Promise.allSettled(
  feeds.slice(0, 5).map(feed => crawlFeedWithTimeout(feed))
)

// 3. 处理结果
for (const result of results) {
  if (result.status === 'fulfilled') {
    // 更新 lastSuccess，重置 consecutiveErrors
  } else {
    // 更新 lastError，递增 consecutiveErrors
    // 如果 >= 10，自动禁用
  }
}
```

**去重算法**（详见 `similarity.ts`）：

```typescript
function isSimilar(existing: Article, incoming: ParsedArticle): boolean {
  // 1. URL 精确匹配
  if (existing.url === incoming.url) return true

  // 2. 标题相似度 > 80%
  const similarity = calculateStringSimilarity(existing.title, incoming.title)
  if (similarity > 0.8) return true

  // 3. 发布时间接近（±2 小时）且相似度 > 60%
  const timeDiff = Math.abs(existing.publishedAt - incoming.publishedAt)
  if (timeDiff < 2 * 60 * 60 * 1000 && similarity > 0.6) return true

  return false
}
```

---

### 相似度计算 (`src/lib/similarity.ts`)

**算法**：基于编辑距离（Levenshtein Distance）的字符串相似度。

```typescript
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = str1.toLowerCase().trim()
  const normalized2 = str2.toLowerCase().trim()

  const distance = levenshteinDistance(normalized1, normalized2)
  const maxLength = Math.max(normalized1.length, normalized2.length)

  return 1 - (distance / maxLength)
}

export function isSameEvent(article1: Article, article2: Article): boolean {
  return calculateSimilarity(article1.title, article2.title) > 0.85
}
```

**复杂度**：O(m×n)，其中 m、n 为字符串长度

**优化**：
- 预处理：小写化、去除首尾空格
- 短路：完全相同直接返回 1.0
- 长度差异过大（>2倍）直接返回 0

---

### 图片代理 (`src/lib/proxy.ts`)

**功能**：
- 解决跨域问题
- 绕过 Referer 防盗链
- 图片压缩和格式转换

**实现**：

```typescript
export async function proxyImage(url: string): Promise<Response> {
  // 1. 验证 URL 合法性
  if (!isValidUrl(url)) throw new Error('Invalid URL')

  // 2. 检查缓存（可选）
  const cached = await cache.get(url)
  if (cached) return cached

  // 3. 抓取图片（不带 Referer）
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NewsPulse/1.0 Image Proxy' },
    redirect: 'follow',
  })

  // 4. 压缩（如果需要）
  let buffer = await response.arrayBuffer()
  if (buffer.byteLength > 500 * 1024) {
    buffer = await compressImage(buffer)
  }

  // 5. 返回（带缓存头）
  return new Response(buffer, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
```

**安全措施**：
- URL 白名单（只允许 http/https 协议）
- 大小限制（最大 10MB）
- 超时控制（10 秒）
- 不暴露原始 URL

---

### 认证模块 (`src/lib/auth.ts`)

**功能**：Admin 后台的简单认证机制。

```typescript
export async function verifyAdmin(request: Request): Promise<boolean> {
  // 1. 从 Cookie 获取 token
  const token = request.cookies.get('admin-token')?.value

  // 2. 验证 token 有效性
  if (!token || !isAdminTokenValid(token)) {
    return false
  }

  return true
}

export async function adminLogin(password: string): Promise<{ success: boolean; token?: string }> {
  // 1. 比对密码
  if (password !== process.env.ADMIN_PASSWORD) {
    return { success: false }
  }

  // 2. 生成 token
  const token = generateSecureToken()

  // 3. 存储到内存/Redis（生产环境建议用 Redis）
  adminSessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24小时
  })

  return { success: true, token }
}
```

**安全特性**：
- Token 使用 crypto.randomBytes() 生成
- 会话过期自动清理
- 防暴力破解（速率限制）

---

## 配置参考

### 环境变量完整列表

#### 必填变量

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `TURSO_DATABASE_URL` | `libsql://newspulse-org.turso.io` | 数据库连接地址 |
| `ADMIN_PASSWORD` | `MyS3cur3P@ss!` | Admin 后台密码（>= 8 字符） |
| `AI_PROVIDER` | `openai` | AI 提供商标识 |
| `AI_MODEL` | `gpt-4o-mini` | 模型名称 |
| `AI_API_KEY` | `sk-proj-xxx` | API 密钥 |
| `CRON_SECRET` | `a1b2c3d4e5f6...` | Cron 鉴权密钥（>= 32 字符随机字符串） |

#### 可选变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TURSO_AUTH_TOKEN` | 空 | Turso 认证 Token（本地 SQLite 可省略） |
| `AI_BASE_URL` | 空 | 自定义 API 端点（用于代理） |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | 服务端口 |

### 运行时配置（DB Config 表）

可通过 Admin 后台动态修改，无需重启服务：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ai_provider` | string | openai | AI 提供商 |
| `ai_model` | string | gpt-4o-mini | 模型名称 |
| `ai_api_key` | string | - | API 密钥 |
| `ai_base_url` | string | null | 自定义端点 |
| `summary_lang` | string | zh | 摘要语言（zh/en） |
| `summary_length` | string | standard | 摘要长度（short/standard/long） |

**优先级**：运行时配置 > 环境变量 > 硬编码默认值

### Next.js 配置 (`next.config.js`)

关键配置项：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 图片域名白名单（用于 next/image）
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },  // 允许所有 HTTPS 图片
    ],
  },

  // Headers 安全配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  // 实验性功能
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client'],
  },
}
```

### Vercel 配置 (`vercel.json`)

```json
{
  "crons": [{
    "path": "/api/cron?secret={{CRON_SECRET}}",
    "schedule": "0 * * * *"  // 每小时执行
  }],
  "headers": [{
    "source": "/api/(.*)",
    "headers": [
      { "key": "Cache-Control", "value": "no-store" }
    ]
  }]
}
```

---

## 部署指南

### Vercel 部署（生产就绪清单）

#### 前置准备

- [ ] GitHub 仓库已创建并推送代码
- [ ] Vercel 账号注册（免费即可）
- [ ] Turso 数据库已创建（免费套餐足够）
- [ ] AI API Key 已获取（OpenAI/Anthropic）

#### 步骤详解

**1. 导入项目**

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New Project"
3. 选择 "Import Git Repository"
4. 授权 GitHub 并选择 newspulse 仓库
5. 点击 "Import"

**2. 配置项目**

Framework Preset: Next.js

```yaml
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

**3. 设置环境变量**

在 Settings → Environment Variables 中添加：

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
ADMIN_PASSWORD=your-password
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-your-key
CRON_SECRET=your-secret
```

**注意**：
- 勾选 Production / Preview / Development 三个环境
- 不要忘记 `CRON_SECRET`（否则 Cron 无法运行）

**4. 首次部署**

点击 "Deploy"，等待构建完成（约 2-3 分钟）

**5. 初始化数据**

1. 访问 `https://your-app.vercel.app/admin`
2. 输入 ADMIN_PASSWORD 登录
3. 检查 AI 配置是否正确
4. 点击「立即抓取」或等待下一次 Cron 触发

**6. （可选）绑定自定义域名**

1. Settings → Domains
2. 输入你的域名（如 `news.yourdomain.com`）
3. 按提示配置 DNS（CNAME 记录指向 `cname.vercel-dns.com`）
4. 等待 SSL 证书自动签发（通常 5-10 分钟）

#### 监控与运维

**查看日志**：
- Deployments → 选择部署 → Logs
- Realtime Logs 可查看实时请求

**监控指标**：
- Analytics 选项卡（免费版有限制）
- Functions 执行次数和耗时

**自动回滚**：
- 如果部署失败，Vercel 会自动回滚到上一个稳定版本
- 也可在 Deployments 手动回滚

**成本估算**（免费套餐）：
- Vercel Hobby: $0/月
  - 100GB 带宽
  - 100 小时 Serverless 执行时间
  - 无限构建次数
- Turso Free: $0/月
  - 9 GB 存储
  - 500M 行读取/月
  - 25M 行写入/月
- AI API:
  - OpenAI gpt-4o-mini: ~$0.15/1M tokens
  - 预估月费用：$1-5（取决于抓取频率和文章数）

---

### VPS 部署（Ubuntu 22.04 LTS）

#### 系统要求

- CPU: 1 核及以上
- 内存: 512 MB 及以上（推荐 1 GB+）
- 磁盘: 10 GB 及以上
- 系统: Ubuntu 22.04 / Debian 12 / CentOS 9+

#### 步骤详解

**1. 系统初始化**

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git ufw

# 配置防火墙
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

**2. 安装 Node.js 20 LTS**

```bash
# 使用 NodeSource 仓库（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # v20.x.x
npm --version   # 10.x.x
```

**3. 安装 PM2 进程管理器**

```bash
sudo npm install -g pm2

# 设置 PM2 开机自启
pm2 startup systemd -u $(whoami) --hp $HOME
pm2 save
```

**4. 克隆并构建项目**

```bash
# 克隆代码
cd /opt
sudo git clone <your-repo-url> newspulse
sudo chown -R $(whoami):$(whoami) newspulse
cd newspulse

# 安装依赖
npm install --production

# 配置环境变量
cp .env.example .env.local
nano .env.local  # 编辑配置...

# 构建
npm run build
```

**5. 启动服务**

```bash
# 使用 PM2 启动
pm2 start npm --name newspulse -- start

# 查看日志
pm2 logs newspulse

# 监控状态
pm2 monit
```

**6. 配置 Nginx 反向代理（推荐）**

```bash
# 安装 Nginx
sudo apt install -y nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/newspulse
```

Nginx 配置：

```nginx
server {
    listen 80;
    server_name news.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # 超时设置（AI 调用可能较慢）
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://localhost:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/newspulse /etc/nginx/sites-enabled/
sudo nginx -t  # 测试配置
sudo systemctl reload nginx
```

**7. 配置 SSL（Let's Encrypt）**

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（自动配置 Nginx）
sudo certbot --nginx -d news.yourdomain.com

# 测试自动续期
sudo certbot renew --dry-run
```

**8. 设置定时任务（替代 Vercel Cron）**

```bash
# 编辑 crontab
crontab -e

# 添加每小时抓取任务
0 * * * * cd /opt/newspulse && /usr/bin/npm run crawl >> /var/log/newspulse-cron.log 2>&1
```

或者使用 systemd timer：

```ini
# /etc/systemd/system/newspulse-crawl.service
[Unit]
Description=NewsPulse Crawler
After=network.target

[Service]
Type=oneshot
User=www-data
WorkingDirectory=/opt/newspulse
ExecStart=/usr/bin/npm run crawl

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/newspulse-crawl.timer
[Unit]
Description=Run NewsPulse Crawler hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable newspulse-crawl.timer
sudo systemctl start newspulse-crawl.timer
```

**9. 备份策略**

```bash
#!/bin/bash
# /opt/scripts/backup-newspulse.sh

BACKUP_DIR="/opt/backups/newspulse"
DATE=$(date +%Y%m%d_%H%M%S)
DB_FILE="/opt/newspulse/newspulse.db"

mkdir -p $BACKUP_DIR

# 备份数据库
cp $DB_FILE "$BACKUP_DIR/db_$DATE.db"

# 备份环境变量（不含敏感信息的副本）
cp /opt/newspulse/.env.local "$BACKUP_DIR/env_$DATE.backup"

# 保留最近 7 天的备份
find $BACKUP_DIR -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# 设置每日备份 cron
0 3 * * * /opt/scripts/backup-newspulse.sh
```

---

### Docker 部署

#### Dockerfile

```dockerfile
# 多阶段构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 生产镜像
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  newspulse:
    build: .
    container_name: newspulse
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    volumes:
      - ./data:/app/data  # SQLite 数据持久化
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  # 可选：使用 Redis 存储会话
  redis:
    image: redis:7-alpine
    container_name: newspulse-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

**启动命令**：

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f newspulse

# 停止
docker-compose down

# 重新构建（代码更新后）
docker-compose up -d --build
```

---

## 开发指南

### 本地开发环境搭建

#### 1. 克隆仓库

```bash
git clone <repository-url>
cd newspulse
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，至少填写：

```env
TURSO_DATABASE_URL=file:./dev.db  # 使用本地 SQLite
ADMIN_PASSWORD=admin
AI_PROVIDER=openai
AI_API_KEY=sk-test  # 可以用测试 key
CRON_SECRET=test-secret-for-dev
```

#### 4. 初始化数据库

```bash
# 推送 schema 到本地 SQLite
npm run db:push
```

#### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

---

### 项目目录约定

```
src/
├── app/                 # Next.js App Router 页面和 API
│   ├── page.tsx         # 首页（客户端组件）
│   ├── layout.tsx       # 根布局
│   ├── globals.css      # 全局样式
│   └── api/             # API 路由（服务端组件）
│       └── [route].ts   # 每个 API 一个文件
│
├── components/          # 可复用 React 组件
│   ├── *.tsx            # UI 组件
│   └── index.ts         # 统一导出
│
└── lib/                 # 工具库和业务逻辑
    ├── *.ts             # 工具函数
    ├── db.ts            # 数据库连接
    └── schema.ts        # 数据库 Schema 定义
```

**命名规范**：
- 文件名：kebab-case（如 `article-panel.tsx`）
- 组件名：PascalCase（如 `ArticlePanel`）
- 函数名：camelCase（如 `parseFeed`）
- 常量：UPPER_SNAKE_CASE（如 `DEFAULT_LIMIT`）

---

### 数据库迁移工作流

**修改 Schema 后**：

```bash
# 1. 生成迁移文件
npm run db:generate

# 这会创建 migrations/0001_xxx.sql

# 2. 查看生成的 SQL（确保正确）
cat migrations/0001_xxx.sql

# 3. 执行迁移
npm run db:migrate

# 或者开发阶段直接推送（会丢失数据！）
npm run db:push
```

**Schema 修改示例**：

```typescript
// src/lib/schema.ts

export const articles = sqliteTable('articles', {
  // ... 现有字段

  // 新增字段
  author: text('author'),  // 作者
  tags: text('tags'),      // 标签（JSON 数组字符串）
})
```

---

### 添加新的 API 端点

**步骤**：

1. 在 `src/app/api/` 下创建目录和路由文件

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // 业务逻辑...
  return NextResponse.json({ data: [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // 业务逻辑...
  return NextResponse.json({ success: true })
}
```

2. 添加类型定义（如果需要）

3. 编写单元测试（推荐）

4. 更新本文档的 API 参考部分

---

### 添加新的 AI 功能

**示例：情感分析**

```typescript
// src/lib/ai.ts

export async function analyzeSentiment(text: string): Promise<{
  sentiment: 'positive' | 'negative' | 'neutral'
  confidence: number
  score: number  // -1 to 1
}> {
  const cfg = await getAIConfig()

  const systemPrompt = `你是一个情感分析专家。分析以下文本的情感倾向。
返回 JSON 格式：{"sentiment": "positive/negative/neutral", "confidence": 0.95, "score": 0.8}`

  const result = await callAIWithConfig(cfg, systemPrompt, text)

  try {
    return JSON.parse(result)
  } catch {
    throw new Error('Failed to parse AI response')
  }
}
```

**在 API 中使用**：

```typescript
// src/app/api/articles/sentiment/route.ts
import { analyzeSentiment } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const { articleId } = await req.json()

  const article = await getArticleById(articleId)
  const analysis = await analyzeSentiment(article.title + ' ' + (article.summary || ''))

  return NextResponse.json(analysis)
}
```

---

### 调试技巧

**1. 查看 Drizzle SQL 日志**

```typescript
// src/lib/db.ts
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, {
  logger: process.env.NODE_ENV === 'development',  // 开发环境打印 SQL
})
```

**2. 使用 VS Code 调试**

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node-terminal",
      "name": "Run Server",
      "request": "launch",
      "command": "npm run dev",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

**3. API 测试工具**

推荐使用：
- [Postman](https://www.postman.com/) / [Insomnia](https://insomnia.rest/)
- VS Code REST Client 扩展
- curl 命令行

示例 `.http` 文件：

```http
### 获取文章列表
GET http://localhost:3000/api/articles?topic=tech&limit=5

### 搜索文章
GET http://localhost:3000/api/search?q=AI&limit=10

### Admin 登录
POST http://localhost:3000/api/api/admin-login
Content-Type: application/json

{
  "password": "admin"
}
```

---

## 性能优化

### 数据库优化

**1. 索引策略**

```sql
-- 高频查询字段加索引
CREATE INDEX idx_articles_topic_published ON articles(topic, published_at DESC);
CREATE INDEX idx_feeds_enabled ON feeds(enabled) WHERE enabled = true;

-- 复合索引（覆盖常用查询）
CREATE INDEX idx_articles_list ON articles(topic, published_at DESC, created_at DESC)
  INCLUDE (id, title, title_zh, image_url, source);
```

**2. 查询优化**

```typescript
// ❌ 避免 N+1 查询
for (const topic of topics) {
  const articles = await db.select().from(articles).where(eq(articles.topic, topic))
}

// ✅ 使用批量查询或窗口函数
const result = await db.all(sql`
  SELECT *, ROW_NUMBER() OVER (PARTITION BY topic ORDER BY published_at DESC) as rn
  FROM articles
`)
```

**3. 连接池配置**

```typescript
// Turso 自动管理连接池
// 如需调整：
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
  // 可选：调整超时
  intMode: 'number',
})
```

---

### 前端优化

**1. 代码分割**

```typescript
// 动态加载重型组件
const ArticlePanel = dynamic(() => import('@/components/ArticlePanel'), {
  loading: () => <p>Loading...</p>,
  ssr: false,
})
```

**2. 图片优化**

```tsx
// 使用 next/image 自动优化
<Image
  src={imageUrl}
  alt={title}
  width={400}
  height={250}
  priority={index < 3}  // 首屏图片优先加载
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

**3. 数据缓存**

```typescript
// 使用 Next.js 缓存
export const revalidate = 3600  // 1 小时 ISR

// 或使用 unstable_cache
import { unstable_cache } from 'next/cache'

const getCachedArticles = unstable_cache(
  async () => getArticlesFromDB(),
  ['articles'],
  { revalidate: 600 }  // 10 分钟
)
```

**4. 虚拟滚动**

对于长列表，使用虚拟滚动提升性能：

```bash
npm install @tanstack/react-virtual
```

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: articles.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 200,
})
```

---

### 抓取性能优化

**1. 并发控制**

```typescript
// 使用 p-limit 控制并发
import pLimit from 'p-limit'

const limit = pLimit(5)  // 最多 5 个并发

const results = await Promise.allSettled(
  feeds.map(feed => limit(() => crawlFeed(feed)))
)
```

**2. 增量抓取**

```typescript
// 只抓取更新的文章（基于 lastSuccess 时间戳）
async function crawlFeedIncrementally(feed: Feed) {
  const lastSuccess = feed.lastSuccess

  const articles = await parseFeed(feed.url)

  // 过滤旧文章
  const newArticles = articles.filter(article =>
    !lastSuccess || article.publishedAt > lastSuccess
  )

  return newArticles
}
```

**3. 结果缓存**

```typescript
// 对相同 URL 的抓取结果短期缓存
const crawlCache = new Map<string, { data: any; timestamp: number }>()

async function cachedParseFeed(url: string) {
  const cached = crawlCache.get(url)
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data
  }

  const data = await parseFeed(url)
  crawlCache.set(url, { data, timestamp: Date.now() })
  return data
}
```

---

### AI 调用优化

**1. 批量处理**

```typescript
// ❌ 逐个翻译
for (const title of titles) {
  const translated = await translateTitle(title)
}

// ✅ 批量翻译（减少 API 调用次数）
async function batchTranslate(titles: string[], batchSize = 10) {
  const results = []
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize)
    const prompt = batch.map((t, idx) => `${idx + 1}. ${t}`).join('\n')
    const translated = await callAI(prompt)
    results.push(...parseBatchResponse(translated))
  }
  return results
}
```

**2. 缓存翻译结果**

```typescript
// 翻译结果存入数据库，避免重复调用
async function translateTitle(title: string): Promise<string> {
  // 检查是否已有翻译
  const existing = await db.select().from(articles).where(eq(articles.title, title))
  if (existing[0]?.titleZh) return existing[0].titleZh

  // 调用 AI
  const translated = await callAIWithConfig(cfg, prompt, title)

  // 保存翻译
  await db.update(articles).set({ titleZh: translated }).where(eq(articles.title, title))

  return translated
}
```

**3. 模型选择建议**

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 标题翻译 | gpt-4o-mini | 便宜、快速、质量够用 |
| 全文翻译 | gpt-4o-mini | 长文本能力强 |
| 摘要生成 | gpt-4o-mini | 理解力好 |
| 复杂推理 | gpt-4o | 质量更高但贵 10x |

**成本预估**（每 1000 次调用）：

| 模型 | 输入成本 | 输出成本 | 总计 |
|------|----------|----------|------|
| gpt-4o-mini | $0.00015 | $0.0006 | $0.00075 |
| gpt-4o | $0.0025 | $0.01 | $0.0125 |
| claude-3-haiku | $0.00025 | $0.00125 | $0.0015 |

---

## 故障排查

### 常见问题及解决方案

#### 1. 数据库连接失败

**症状**：
```
Error: Database connection failed: TURSO_AUTH_TOKEN missing
```

**解决方案**：

```bash
# 检查环境变量
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN

# 确保 .env.local 文件存在且格式正确
cat .env.local

# Turso 用户：验证 token 有效性
turso db tokens list

# 本地 SQLite：检查文件权限
ls -la newspulse.db
chmod 644 newspulse.db
```

---

#### 2. AI 调用失败

**症状**：
```
Error: AI API Key not configured
Error: Rate limit exceeded
Error: Invalid API key
```

**解决方案**：

```bash
# 1. 检查 API Key 是否正确配置
# Admin 后台 → AI 配置 → 查看 ai_api_key

# 2. 测试 API Key 有效性
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $AI_API_KEY"

# 3. 检查余额
# OpenAI: https://platform.openai.com/usage
# Anthropic: https://console.anthropic.com/settings/usage

# 4. 如果使用代理，检查 AI_BASE_URL
curl $AI_BASE_URL/models \
  -H "Authorization: Bearer $AI_API_KEY"
```

**常见错误码**：

| HTTP 状态码 | 含义 | 解决方案 |
|-------------|------|----------|
| 401 | API Key 无效 | 检查 Key 是否正确 |
| 429 | 速率限制 | 降低调用频率或升级套餐 |
| 500 | 服务端错误 | 稍后重试或更换模型 |
| 503 | 服务不可用 | 检查 OpenAI/Anthropic 状态页 |

---

#### 3. RSS 抓取失败

**症状**：
```
Error: Feed fetch failed: 403
Error: Feed fetch failed: ETIMEDOUT
```

**解决方案**：

```bash
# 1. 手动测试 RSS URL 是否可访问
curl -v https://example.com/feed.xml

# 2. 检查是否被 User-Agent 限制
curl -A "NewsPulse/1.0" https://example.com/feed.xml

# 3. 检查 DNS 解析
nslookup example.com

# 4. 检查网络连通性
ping example.com

# 5. 查看具体错误日志
# Admin 后台 → 源管理 → 查看最后错误
```

**常见原因及解决**：

| 原因 | 症状 | 解决方案 |
|------|------|----------|
| 403 Forbidden | 需要 Referer 或 Cookie | 使用代理或更换源 |
| 证书过期 | SSL 错误 | 更新 CA 证书或忽略证书（不推荐） |
| 超时 | ETIMEDOUT | 增加超时时间或使用更快的网络 |
| XML 解析错误 | 格式不标准 | 检查 RSS 源是否有效 |

---

#### 4. 内存不足（OOM）

**症状**：
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**解决方案**：

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=512" npm run dev

# 或在 package.json 中配置
{
  "scripts": {
    "dev": "NODE_OPTIONS='--max-old-space-size=512' next dev"
  }
}
```

**预防措施**：
- 限制单次抓取的文章数量
- 使用流式处理而非一次性加载
- 监控内存使用情况

---

#### 5. 构建失败

**症状**：
```
Type Error: Cannot find module 'xxx'
Build error: ESM / CommonJS conflict
```

**解决方案**：

```bash
# 1. 清除缓存并重新安装
rm -rf node_modules .next
npm install

# 2. 检查 TypeScript 错误
npx tsc --noEmit

# 3. 检查依赖冲突
npm ls

# 4. 使用精确版本
npm install package@exact-version
```

---

#### 6. 部署后 404 或 500 错误

**症状**：
- Vercel 部署后访问返回 404
- API 路由返回 500 Internal Server Error

**解决方案**：

```bash
# 1. 检查构建日志
# Vercel Dashboard → Deployments → View Build Logs

# 2. 检查环境变量是否完整
# Settings → Environment Variables → 所有变量都已添加？

# 3. 检查平台兼容性
# 某些 npm 包可能不支持 Edge Runtime
# next.config.js 中排除：
experimental: {
  serverComponentsExternalPackages: ['@libsql/client'],
}

# 4. 本地测试构建
npm run build && npm start
# 然后访问 http://localhost:3000
```

---

### 日志收集与分析

**开启详细日志**：

```typescript
// src/lib/db.ts
export const db = drizzle(client, {
  logger: true,  // 打印所有 SQL 查询
})
```

**自定义日志中间件**：

```typescript
// middleware.ts (项目根目录)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const start = Date.now()

  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`)

  const response = NextResponse.next()

  response.headers.set('X-Response-Time', `${Date.now() - start}ms`)

  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
```

**日志级别建议**：

| 环境 | 日志级别 | 说明 |
|------|----------|------|
| 开发 | DEBUG | 所有信息 |
| 预发布 | INFO | 重要事件 |
| 生产 | WARN | 仅警告和错误 |

---

### 性能监控

**内置监控指标**：

```typescript
// 可在 API 中添加耗时统计
export async function GET(req: NextRequest) {
  const start = Date.now()

  // ... 业务逻辑

  const duration = Date.now() - start

  // 慢查询警告
  if (duration > 1000) {
    console.warn(`Slow API call: ${req.url} took ${duration}ms`)
  }

  return NextResponse.json({ data, duration })
}
```

**推荐的外部监控**：

- **Vercel Analytics**：开箱即用
- **Sentry**：错误追踪和性能监控
- **UpTimeRobot**：可用性监控
- **Grafana + Prometheus**：自定义仪表盘（高级用户）

---

## 附录

### 内置 RSS 源列表

| 名称 | URL | 分类 |
|------|-----|------|
| TechCrunch | https://techcrunch.com/feed/ | tech |
| The Verge | https://www.theverge.com/rss/index.xml | tech |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index | tech |
| Hacker News | https://hnrss.org/frontpage | tech |
| Wired | https://www.wired.com/feed/rss | tech |
| Reuters Technology | https://www.reuters.com/rssFeed/technology | tech |
| BBC Technology | https://feeds.bbci.co.uk/news/technology/rss.xml | tech |
| Reuters World | https://www.reuters.com/rssFeed/worldNews | world |
| BBC World | https://feeds.bbci.co.uk/news/world/rss.xml | world |
| Al Jazeera | https://www.al Jazeera.com/xml/rss/all.xml | world |
| NPR News | https://feeds.npr.org/1001/rss.xml | world |
| Bloomberg Technology | https://feeds.bloomberg.com/technology/rss.xml | finance |
| CNBC | https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114 | finance |
| Financial Times | https://www.ft.com/rss/home | finance |
| Yahoo Finance | https://finance.yahoo.com/news/rssindex | finance |
| Nature | https://www.nature.com/rss/current.xml | science |
| Science Daily | https://www.sciencedaily.com/rss/all.xml | science |
| MIT Tech Review | https://www.technologyreview.com/feed/ | science |

**添加新源**：

1. Admin 后台 → 源管理 → 添加源
2. 或直接修改 `src/lib/init-db.ts` 中的 seed 数据

---

### 主题分类体系

| 主题 ID | 显示名称 | 说明 |
|---------|----------|------|
| `tech` | 科技 | 科技新闻和产品发布 |
| `world` | 国际 | 全球重大新闻 |
| `finance` | 财经 | 金融、市场、经济 |
| `science` | 科学 | 科研进展和发现 |
| `sports` | 体育 | 体育赛事和新闻 |
| `entertainment` | 娱乐 | 影视、音乐、文化 |
| `health` | 健康 | 医学健康资讯 |
| `politics` | 政治 | 政策和政治动态 |

**自定义主题**：可在添加源时输入任意主题名称，系统会自动分配颜色。

---

### API 速率限制

| 接口 | 限制 | 窗口期 | 说明 |
|------|------|--------|------|
| `GET /api/articles` | 100 次/分 | 1 分钟 | 公开端点，宽松限制 |
| `POST /api/articles/translate` | 10 次/分 | 1 分钟 | AI 调用，严格限制 |
| `POST /api/admin-login` | 5 次/15 分 | 15 分钟 | 防暴力破解 |
| `GET /api/cron` | 1 次/分 | 1 分钟 | 防止滥用 |
| 其他 | 60 次/分 | 1 分钟 | 默认限制 |

**实现方式**（未来可添加）：

```typescript
// 基于 Redis 或内存的简单限流
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(key)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= limit) return false

  record.count++
  return true
}
```

---

### 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v0.1.0 | 2024-01 | 初始版本 |
| v0.2.0 | 2024-02 | 添加多视图支持 |
| v0.3.0 | 2024-03 | 添加 AI 全文翻译 |
| v0.4.0 | 2024-04 | 添加 Admin 后台 |
| v0.5.0 | 2024-05 | 添加搜索和热门功能 |

---

### 贡献者指南

**代码风格**：

- TypeScript strict 模式
- ESLint + Prettier 格式化
- 函数式编程优先
- 避免任何类型（any），使用具体类型

**Git Commit 规范**：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构（不修复 bug 也不添加功能）
perf: 性能优化
test: 测试相关
chore: 构建/工具变更
```

**Pull Request 流程**：

1. Fork 并创建特性分支
2. 编写代码和测试
3. 确保通过所有检查（build, lint, test）
4. 编写清晰的 PR 描述
5. 等待 Code Review
6. 合并后删除分支

---

### 许可证

MIT License

Copyright (c) 2024 NewsP Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## 获取帮助

- 📖 **文档**：查阅本文件和 README.md
- 🐛 **Bug 报告**：[GitHub Issues](https://github.com/your-repo/issues)
- 💬 **讨论**：[GitHub Discussions](https://github.com/your-repo/discussions)
- 📧 **邮件**：your-email@example.com

---

<p align="center">
  <strong>🎉 感谢使用 NewsPulse！</strong><br>
  <em>如有问题或建议，欢迎提交 Issue 或 Pull Request</em>
</p>
