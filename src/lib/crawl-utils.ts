import { db } from './db'
import { feeds, articles } from './schema'
import { eq } from 'drizzle-orm'
import { parseFeed } from './rss-parser'
import { generateSummary } from './ai'
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

          for (const item of items) {
            if (saved >= actualLimit) break
            if (!item.url || !item.title) continue

            onProgress?.({ type: 'article', feedName: feed.name, title: item.title })

            try {
              const { summary, titleZh } = await generateSummary(item.title, item.summary)
              const result = await db.insert(articles).values({
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

              const affected = (result as any).rowsAffected ?? (result as any).changes ?? 1
              if (affected === 0) {
                skipped++
              } else {
                saved++
              }
            } catch (e) {
              console.error(`AI/DB error for ${item.url}:`, e)
            }
          }
        } catch (e) {
          onProgress?.({ type: 'feed_done', feedName: feed.name, saved: 0, skipped: 0, error: String(e) })
          throw e
        }

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