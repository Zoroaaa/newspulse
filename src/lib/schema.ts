import { sql } from 'drizzle-orm'
import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const feeds = sqliteTable('feeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull().unique(),
  topic: text('topic').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  consecutiveErrors: integer('consecutive_errors').notNull().default(0),
  lastError: text('last_error'),
  lastSuccess: integer('last_success', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const articles = sqliteTable('articles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedId: integer('feed_id').notNull().references(() => feeds.id),
  title: text('title').notNull(),
  titleZh: text('title_zh'),
  url: text('url').notNull().unique(),
  summary: text('summary'),
  imageUrl: text('image_url'),
  source: text('source').notNull(),
  topic: text('topic').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const articleViews = sqliteTable('article_views', {
  articleId: integer('article_id').notNull().references(() => articles.id),
  viewedAt: integer('viewed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
