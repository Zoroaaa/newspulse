# NewsPulse

<p align="center">
  <strong>AI 驱动的新闻聚合阅读器</strong><br>
  <em>RSS 订阅 · AI 摘要 · 全文翻译 · 多视图展示</em>
</p>

---

## ✨ 核心特性

### 📰 智能内容聚合
- **17+ 内置 RSS 源**：覆盖国际新闻、科技、财经、科学等领域
- **自定义源管理**：支持新增、启用/禁用任意 RSS 源
- **智能去重**：基于相似度算法过滤重复内容
- **定时抓取**：Vercel Cron 自动更新（每小时）

### 🤖 AI 能力
- **多模型支持**：OpenAI / Anthropic / 自定义 Base URL
- **一键翻译**：批量翻译英文标题为中文
- **全文翻译**：AI 抓取原文并生成中文翻译
- **智能摘要**：自动生成文章摘要

### 🎨 多视图体验
- **杂志视图**：大图卡片式布局，视觉冲击力强
- **卡片视图**：紧凑的网格布局，信息密度高
- **列表视图**：传统列表形式，浏览效率高
- **图片视图**：纯图片瀑布流，快速扫读

### 🔧 管理功能
- **Admin 后台**：`/admin` 路由，密码保护
- **源管理**：查看状态、错误日志、手动触发抓取
- **AI 配置**：动态切换 AI 提供商和模型
- **访问统计**：PV/UV 数据追踪
- **OPML 导入导出**：方便迁移订阅源

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI** | React 19 + Tailwind CSS 3 |
| **数据库** | [Turso](https://tur.so/) (libSQL / SQLite) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **AI SDK** | OpenAI / Anthropic |
| **解析器** | fast-xml-parser (RSS) + cheerio (HTML) |
| **部署** | [Vercel](https://vercel.com/) / VPS |
| **运行时** | Node.js (Edge 兼容) |

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- npm 或 pnpm
- Turso 账号（或本地 SQLite）

### 1️⃣ 克隆 & 安装

```bash
git clone <your-repo-url>
cd newspulse
npm install
```

### 2️⃣ 创建数据库（Turso）

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 登录并创建数据库
turso auth login
turso db create newspulse

# 获取连接信息
turso db show newspulse          # 记录 Database URL
turso db tokens create newspulse # 记录 Auth Token
```

> 💡 **提示**：也可使用本地 SQLite，无需 Turso 账号

### 3️⃣ 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
# ===== 数据库配置 =====
TURSO_DATABASE_URL=libsql://newspulse-<your-org>.turso.io
TURSO_AUTH_TOKEN=<your-turso-token>

# ===== 管理后台 =====
ADMIN_PASSWORD=<your-secure-password>

# ===== AI 配置 =====
AI_PROVIDER=openai              # openai | anthropic | custom
AI_MODEL=gpt-4o-mini            # 推荐使用轻量模型以节省成本
AI_API_KEY=sk-xxx               # API 密钥
# AI_BASE_URL=https://...       # 可选：自定义代理地址

# ===== 定时任务 =====
CRON_SECRET=<random-string>     # Vercel Cron 鉴权密钥
```

### 4️⃣ 初始化数据库 & 启动

```bash
# 开发模式启动（首次运行会自动建表并 seed 内置 RSS 源）
npm run dev
```

访问地址：
- 🏠 **首页**：http://localhost:3000
- ⚙️ **后台**：http://localhost:3000/admin

### 5️⃣ 手动触发首次抓取

```bash
# 方式一：访问 Cron 端点
curl "http://localhost:3000/api/cron?secret=<CRON_SECRET>"

# 方式二：使用脚本
npm run crawl
```

## 📦 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (http://localhost:3000) |
| `npm run build` | 生产环境构建 |
| `npm start` | 启动生产服务器 |
| `npm run crawl` | 手动执行一次 RSS 抓取 |
| `npm run db:generate` | 生成 Drizzle 迁移文件 |
| `npm run db:migrate` | 执行数据库迁移 |
| `npm run db:push` | 推送 schema 到数据库（开发用） |

## 🌐 部署方案

### 方案 A：Vercel（推荐）

✅ **优势**：零运维、免费额度、全球 CDN、内置 Cron

1. **推送代码到 GitHub**
2. **Vercel 导入仓库**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
3. **配置环境变量**
   - Vercel Dashboard → Settings → Environment Variables
   - 添加所有 `.env.local` 中的变量
4. **部署**
   - 自动部署会在每次 push 时触发
   - 或手动点击 "Deploy"
5. **初始化**
   - 访问 `https://your-domain.com/admin`
   - 配置 AI → 点击「立即抓取」

**Cron 配置**：
- 已在 `vercel.json` 中预配置每小时执行
- 路径：`/api/cron`
- 鉴权：通过 `CRON_SECRET` 参数

### 方案 B：VPS / 自托管

✅ **优势**：完全控制、数据自主、无平台限制

```bash
# 1. 安装 Node.js 18+
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆代码
git clone <your-repo-url>
cd newspulse
npm install --production

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local ...

# 4. 构建
npm run build

# 5. 启动（选择其一）
# 方式 A：直接启动
npm start

# 方式 B：PM2 进程管理（推荐）
pm2 start npm --name newspulse -- start
pm2 save
pm2 startup

# 方式 C：systemd 服务
sudo nano /etc/systemd/system/newspulse.service
# 填入服务配置后：
sudo systemctl enable newspulse
sudo systemctl start newspulse
```

**使用本地 SQLite**：
```env
TURSO_DATABASE_URL=file:./newspulse.db
TURSO_AUTH_TOKEN=  # 留空即可
```

### 方案 C：Docker（可选）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# 构建并运行
docker build -t newspulse .
docker run -d \
  --name newspulse \
  --env-file .env.local \
  -p 3000:3000 \
  newspulse
```

## 📁 项目结构

```
newspulse/
├── .github/workflows/      # GitHub Actions (Cron 备选)
├── public/                  # 静态资源
│   ├── manifest.json        # PWA 配置
│   └── sw.js                # Service Worker
├── scripts/
│   └── crawl.ts             # 独立抓取脚本
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── admin/           # Admin 后台页面
│   │   ├── api/             # API 路由
│   │   │   ├── articles/    # 文章相关接口
│   │   │   ├── feeds/       # RSS 源管理
│   │   │   ├── admin-*/     # 管理接口
│   │   │   ├── cron/        # 定时任务端点
│   │   │   ├── search/      # 搜索功能
│   │   │   └── trending/    # 热门推荐
│   │   ├── globals.css      # 全局样式
│   │   ├── layout.tsx       # 根布局
│   │   └── page.tsx         # 首页
│   ├── components/          # React 组件
│   │   ├── ArticlePanel.tsx    # 文章详情面板
│   │   ├── HeadlineCarousel.tsx # 头条轮播
│   │   └── ErrorBoundary.tsx   # 错误边界
│   └── lib/                 # 核心库
│       ├── ai.ts            # AI 集成层
│       ├── auth.ts          # 认证逻辑
│       ├── config.ts        # 配置管理
│       ├── db.ts            # 数据库连接
│       ├── schema.ts        # 数据库 Schema
│       ├── rss-parser.ts    # RSS 解析器
│       ├── crawl-utils.ts   # 抓取工具函数
│       ├── proxy.ts         # 图片代理
│       └── similarity.ts    # 相似度计算
├── drizzle.config.ts        # Drizzle ORM 配置
├── next.config.js           # Next.js 配置
├── tailwind.config.js       # Tailwind CSS 配置
├── vercel.json              # Vercel 部署配置
├── .env.example             # 环境变量示例
└── package.json             # 项目依赖
```

## 🗄 数据库设计

### 核心表结构

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `feeds` | RSS 源 | name, url, topic, enabled, isBuiltin |
| `articles` | 文章 | title, titleZh, url, summary, source, topic |
| `article_views` | 浏览记录 | articleId, viewedAt |
| `config` | 系统配置 | key, value (KV 存储) |
| `site_access_stats` | 访问统计 | visitedAt, userAgent, referrer |

### 关系图

```
feeds (1) ──→ (N) articles (1) ──→ (N) article_views
config (独立 KV 存储)
site_access_stats (独立统计表)
```

## 🔌 API 端点概览

### 公开接口
- `GET /api/articles` - 获取文章列表（分页、筛选）
- `GET /api/articles/[id]` - 获取文章详情
- `POST /api/articles/translate/view` - 获取全文翻译
- `POST /api/articles/translate` - 批量翻译标题
- `GET /api/feeds` - 获取 RSS 源列表
- `GET /api/search?q=` - 搜索文章
- `GET /api/trending` - 获取热门文章
- `GET /api/config/public` - 获取公开配置
- `GET /api/proxy/image?url=` - 图片代理
- `POST /api/opml` - 导出 OPML

### 管理接口（需认证）
- `POST /api/admin-login` - 登录验证
- `POST /api/admin-crawl` - 手动触发抓取
- `POST /api/admin-init-db` - 初始化数据库
- `GET/PUT /api/config` - 配置管理

### 定时任务
- `GET /api/cron?secret=` - Vercel Cron 端点

## ⚙️ 配置说明

### 环境变量详解

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `TURSO_DATABASE_URL` | ✅ | - | Turso 数据库 URL 或本地 SQLite 路径 |
| `TURSO_AUTH_TOKEN` | ❌ | - | Turso 认证 Token（本地 SQLite 可省略） |
| `ADMIN_PASSWORD` | ✅ | - | Admin 后台密码 |
| `AI_PROVIDER` | ✅ | openai | AI 提供商：openai / anthropic / custom |
| `AI_MODEL` | ✅ | gpt-4o-mini | AI 模型名称 |
| `AI_API_KEY` | ✅ | - | AI API 密钥 |
| `AI_BASE_URL` | ❌ | - | 自定义 API 代理地址 |
| `CRON_SECRET` | ✅ | - | Cron 任务鉴权密钥 |

### AI Provider 配置示例

**OpenAI**:
```env
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-xxx
```

**Anthropic**:
```env
AI_PROVIDER=anthropic
AI_MODEL=claude-3-haiku-20240307
AI_API_KEY=sk-ant-xxx
```

**自定义代理**:
```env
AI_PROVIDER=custom
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-xxx
AI_BASE_URL=https://your-proxy.com/v1
```

## 📊 监控与统计

### 内置统计功能
- **页面访问量 (PV)**：记录每次页面加载
- **文章阅读量**：追踪用户点击的文章
- **来源分析**：User-Agent 和 Referrer 记录
- **RSS 源健康度**：连续错误次数、最后成功时间

### 查看统计数据
- Admin 后台 → 源管理页面可查看各源状态
- 数据库 `site_access_stats` 表存储原始访问日志

## 🔒 安全注意事项

1. **Admin 密码**：务必设置强密码，避免使用默认值
2. **CRON_SECRET**：使用随机字符串，防止未授权调用
3. **API Key 保护**：不要将 API Key 提交到版本控制
4. **环境变量**：生产环境通过平台安全存储，不要硬编码
5. **HTTPS**：生产环境强制使用 HTTPS

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码规范
- 使用 TypeScript 编写新代码
- 遵循现有代码风格
- 为新功能添加必要的类型定义
- 确保 `npm run build` 通过

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙋 常见问题

<details>
<summary><b>❓ 如何切换 AI 提供商？</b></summary>

访问 `/admin` 页面，在 AI 配置区域修改 Provider 和 Model，保存后立即生效。
</details>

<details>
<summary><b>❓ 抓取失败怎么办？</b></summary>

1. 检查 RSS 源是否可访问
2. 查看 Admin 后台的错误日志
3. 尝试禁用再启用该源
4. 检查 AI API Key 是否有效
</details>

<details>
<summary><b>❓ 如何添加自定义 RSS 源？</b></summary>

1. 访问 `/admin` 页面
2. 在「源管理」区域点击「添加源」
3. 填写名称、URL、主题分类
4. 保存后下次抓取时生效
</details>

<details>
<summary><b>❓ 如何备份数据？</b></summary>

**Turso 用户**：
```bash
turso db shell newspulse ".dump > backup.sql"
```

**SQLite 用户**：
```bash
cp newspulse.db backup.db
```
</details>

<details>
<summary><b>❓ 支持哪些 RSS 格式？</b></summary>

支持标准 RSS 2.0、Atom 1.0 以及大多数非标准变体。
</details>

---

## 📚 相关文档

- 📖 [详细技术文档](./DOCUMENTATION.md) - 架构设计、API 详情、开发指南
- ⚙️ [配置参考](./DOCUMENTATION.md#配置参考) - 完整配置选项说明
- 🚀 [部署指南](./DOCUMENTATION.md#部署指南) - 生产环境部署最佳实践

---

<p align="center">
  <strong>⭐ 如果这个项目对你有帮助，请给一个 Star！⭐</strong>
</p>
