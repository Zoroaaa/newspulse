# NewsPulse

AI 驱动的新闻聚合阅读器。RSS 订阅 + AI 摘要 + 全文翻译。

## 技术栈

- **框架**: Next.js 15 (App Router)
- **数据库**: Turso (libSQL / SQLite)
- **ORM**: Drizzle
- **部署**: Vercel
- **AI**: OpenAI / Anthropic / 自定义 Base URL

## 快速开始

### 1. 克隆 & 安装

```bash
git clone <your-repo>
cd newspulse
npm install
```

### 2. 创建 Turso 数据库

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 登录
turso auth login

# 创建数据库
turso db create newspulse

# 获取连接信息
turso db show newspulse
turso db tokens create newspulse
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入：

```
TURSO_DATABASE_URL=libsql://newspulse-<your-org>.turso.io
TURSO_AUTH_TOKEN=<your-token>
ADMIN_PASSWORD=<your-password>
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-xxx
CRON_SECRET=<random-string>
```

### 4. 初始化数据库

```bash
# 首次运行会自动建表并 seed 内置 RSS 源
# 或手动访问：
curl http://localhost:3000/api/cron?secret=<CRON_SECRET>
```

### 5. 本地开发

```bash
npm run dev
```

- 首页: http://localhost:3000
- 后台: http://localhost:3000/admin

## 部署到 Vercel

1. Push 到 GitHub
2. Vercel 导入仓库
3. 在 Vercel Project Settings → Environment Variables 填入所有变量
4. 部署完成后，访问 `/admin` → 配置 AI → 点击「立即抓取」

Vercel Cron 已配置为每小时自动抓取（`vercel.json`）。

## 迁移到 VPS

```bash
# 1. 安装 Node.js
# 2. 克隆代码
# 3. 将环境变量写入 .env.local
# 4. 构建
npm run build

# 5. 启动
npm start

# 或用 PM2
pm2 start npm --name newspulse -- start
```

Turso 可继续使用，或将数据库换成本地 SQLite：
```
TURSO_DATABASE_URL=file:./newspulse.db
TURSO_AUTH_TOKEN=  # 留空
```

## 功能

- **4 种视图**: 杂志 / 卡片 / 列表 / 图片
- **一键翻译标题**: 把所有英文标题翻译为中文
- **全文翻译**: 点击文章 → AI 抓取原文 → 中文翻译
- **17 个内置 RSS 源**: 国际 / 科技 / 财经 / 科学
- **自定义源**: 可新增、启用/禁用任意 RSS 源
- **AI 自由配置**: OpenAI / Anthropic / 自定义 Base URL
- **Admin 后台**: `/admin` 密码保护
