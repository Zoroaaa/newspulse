import { db } from './db'
import { feeds, config } from './schema'
import { BUILTIN_FEEDS } from './feeds-data'
import { sql } from 'drizzle-orm'

export async function initDB() {
  await db.run(sql`CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    topic TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_success INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  // 兼容旧库：新字段按需迁移
  for (const col of [
    'ALTER TABLE feeds ADD COLUMN consecutive_errors INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE feeds ADD COLUMN last_error TEXT',
    'ALTER TABLE feeds ADD COLUMN last_success INTEGER',
  ]) {
    try { await db.run(sql.raw(col)) } catch { /* 字段已存在，忽略 */ }
  }

  await db.run(sql`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL REFERENCES feeds(id),
    title TEXT NOT NULL,
    title_zh TEXT,
    url TEXT NOT NULL UNIQUE,
    summary TEXT,
    image_url TEXT,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    published_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  // 主查询路径索引：按 topic 分组 + 按时间排序
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_articles_topic_time
    ON articles (topic, COALESCE(published_at, created_at) DESC)`)

  // 清理任务索引：按 created_at 范围删除
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_articles_created_at
    ON articles (created_at)`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS article_views (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    viewed_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_article_views_article_id
    ON article_views (article_id)`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_article_views_viewed_at
    ON article_views (viewed_at)`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS site_access_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visited_at INTEGER NOT NULL DEFAULT (unixepoch()),
    user_agent TEXT,
    referrer TEXT
  )`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_site_access_stats_visited_at
    ON site_access_stats (visited_at)`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  for (const feed of BUILTIN_FEEDS) {
    await db.run(sql`INSERT OR IGNORE INTO feeds (name, url, topic, enabled, is_builtin)
      VALUES (${feed.name}, ${feed.url}, ${feed.topic}, 1, 1)`)
  }

  await db.run(sql`INSERT OR IGNORE INTO config (key, value) VALUES ('per_feed_limit', '6')`)
}
