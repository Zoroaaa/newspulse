import { db } from './db'
import { feeds, articles } from './schema'
import { eq } from 'drizzle-orm'
import { parseFeed } from './rss-parser'
import { generateSummary } from './ai'
import { initDB } from './init-db'
import { isDuplicate, makeRecord, TitleRecord } from './dedup'

const BATCH_SIZE = 5

export type ProgressEvent =
  | { type: 'start'; totalFeeds: number }
  | { type: 'feed_start'; feedName: string; feedIndex: number; totalFeeds: number }
  | { type: 'feed_done'; feedName: string; saved: number; skipped: number; deduped: number; error?: string }
  | { type: 'article'; feedName: string; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

type ProgressCallback = (event: ProgressEvent) => void

/**
 * 主抓取函数（带进度回调 + 去重）
 */
export async function crawlAllFeedsWithProgress(
  maxArticles = 30,
  onProgress?: ProgressCallback
): Promise<{ total: number; errors: number }> {
  await initDB()
  const enabledFeeds = await db.select().from(feeds).where(eq(feeds.enabled, true))

  onProgress?.({ type: 'start', totalFeeds: enabledFeeds.length })

  // 预载已有文章标题，用于去重
  const existingTitles: TitleRecord[] = (
    await db.select({ title: articles.title }).from(articles).limit(2000)
  ).map(r => makeRecord(r.title))

  let total = 0
  let errors = 0
  const perFeedLimit = Math.max(1, Math.ceil(maxArticles / Math.max(enabledFeeds.length, 1)))

  for (let i = 0; i < enabledFeeds.length; i += BATCH_SIZE) {
    if (total >= maxArticles) break

    const batch = enabledFeeds.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (feed, batchIdx) => {
        const feedIndex = i + batchIdx
        onProgress?.({ type: 'feed_start', feedName: feed.name, feedIndex, totalFeeds: enabledFeeds.length })

        let saved = 0
        let skipped = 0  // URL 冲突（完全重复）
        let deduped = 0  // SimHash 去重（内容相似）

        try {
          const items = await parseFeed(feed.url)

          for (const item of items) {
            if (saved >= perFeedLimit) break
            if (!item.url || !item.title) continue

            // SimHash 去重：标题高度相似则跳过
            if (isDuplicate(item.title, existingTitles)) {
              deduped++
              continue
            }

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
                skipped++ // URL 重复
              } else {
                saved++
                // 加入去重池
                existingTitles.push(makeRecord(item.title))
              }
            } catch (e) {
              console.error(`AI/DB error for ${item.url}:`, e)
            }
          }
        } catch (e) {
          onProgress?.({ type: 'feed_done', feedName: feed.name, saved: 0, skipped: 0, deduped: 0, error: String(e) })
          throw e
        }

        onProgress?.({ type: 'feed_done', feedName: feed.name, saved, skipped, deduped })
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
export async function crawlAllFeedsWithFeedId(maxArticles = 30) {
  return crawlAllFeedsWithProgress(maxArticles)
}

// 主导出别名
export const crawlAllFeeds = crawlAllFeedsWithFeedId