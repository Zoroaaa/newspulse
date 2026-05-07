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
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

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

  await db.run(sql`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  for (const feed of BUILTIN_FEEDS) {
    await db.run(sql`INSERT OR IGNORE INTO feeds (name, url, topic, enabled, is_builtin)
      VALUES (${feed.name}, ${feed.url}, ${feed.topic}, 1, 1)`)
  }
}
