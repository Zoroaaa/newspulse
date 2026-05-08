import { db } from './db'
import { feeds, articles } from './schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { parseFeed } from './rss-parser'
import { generateSummary, getAIConfig } from './ai'
import { initDB } from './init-db'
import { getConfigNumber } from './config'

const BATCH_SIZE = 5
const DEFAULT_PER_FEED_LIMIT = 6

export type ProgressEvent =
  | { type: 'start'; totalFeeds: number; perFeedLimit: number }
  | { type: 'feed_start'; feedName: string; feedIndex: number; totalFeeds: number }
  | { type: 'feed_done'; feedName: string; saved: number; skipped: number; error?: string }
  | { type: 'article'; feedName: string; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

type ProgressCallback = (event: ProgressEvent) => void

/**
 * 主抓取函数（带进度回调 + URL 去重）
 * @param perFeedLimit 每个 feed 最多抓取的文章数，默认 6
 */
export async function crawlAllFeedsWithProgress(
  perFeedLimit?: number,
  onProgress?: ProgressCallback
): Promise<{ total: number; errors: number }> {
  await initDB()

  // 预加载一次 AI config，整个爬取过程复用，避免每篇文章查一次 DB
  const aiConfig = await getAIConfig()
  const actualLimit = perFeedLimit ?? await getConfigNumber('per_feed_limit', DEFAULT_PER_FEED_LIMIT)
  const enabledFeeds = await db.select().from(feeds).where(eq(feeds.enabled, true))

  onProgress?.({ type: 'start', totalFeeds: enabledFeeds.length, perFeedLimit: actualLimit })

  let total = 0
  let errors = 0

  for (let i = 0; i < enabledFeeds.length; i += BATCH_SIZE) {
      const batch = enabledFeeds.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (feed, batchIdx) => {
        const feedIndex = i + batchIdx
        onProgress?.({ type: 'feed_start', feedName: feed.name, feedIndex, totalFeeds: enabledFeeds.length })

        let saved = 0
        let skipped = 0

        try {
          const items = await parseFeed(feed.url, actualLimit)
          const candidates = items.filter(item => item.url && item.title)

          // 批量查已存在的 URL，避免逐条依赖 rowsAffected 的不稳定行为
          const urls = candidates.map(i => i.url)
          const existing = urls.length > 0
            ? new Set((await db.select({ url: articles.url }).from(articles).where(inArray(articles.url, urls))).map(r => r.url))
            : new Set<string>()

          for (const item of candidates) {
            if (saved >= actualLimit) break

            if (existing.has(item.url)) {
              skipped++
              continue
            }

            onProgress?.({ type: 'article', feedName: feed.name, title: item.title })

            try {
              const { summary, titleZh } = await generateSummary(item.title, item.summary, aiConfig)
              await db.insert(articles).values({
                feedId: feed.id,
                title: item.title,
                titleZh,
                url: item.url,
                summary,
                imageUrl: item.imageUrl,
                source: feed.name,
                topic: feed.topic,
                publishedAt: item.publishedAt,
              }).onConflictDoNothing()
              saved++
            } catch (e) {
              console.error(`AI/DB error for ${item.url}:`, e)
            }
          }
        } catch (e) {
          // 记录连续失败次数和最后一次错误信息
          await db.update(feeds).set({
            consecutiveErrors: sql`consecutive_errors + 1`,
            lastError: String(e),
          }).where(eq(feeds.id, feed.id)).catch(() => {})
          onProgress?.({ type: 'feed_done', feedName: feed.name, saved: 0, skipped: 0, error: String(e) })
          throw e
        }

        // 成功：重置错误计数，更新最后成功时间
        await db.update(feeds).set({
          consecutiveErrors: 0,
          lastError: null,
          lastSuccess: new Date(),
        }).where(eq(feeds.id, feed.id)).catch(() => {})

        onProgress?.({ type: 'feed_done', feedName: feed.name, saved, skipped })
        return saved
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        errors++
      } else {
        total += result.value
      }
    }
  }

  return { total, errors }
}

// 向后兼容：cron 路由用这个
export async function crawlAllFeedsWithFeedId(perFeedLimit?: number) {
  return crawlAllFeedsWithProgress(perFeedLimit)
}

// 主导出别名
export const crawlAllFeeds = crawlAllFeedsWithFeedId