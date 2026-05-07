import { db } from './db'
import { feeds, articles } from './schema'
import { eq } from 'drizzle-orm'
import { parseFeed } from './rss-parser'
import { generateSummary } from './ai'
import { initDB } from './init-db'

const BATCH_SIZE = 5

export { crawlAllFeeds as crawlAllFeedsWithFeedId }
export async function crawlAllFeeds(maxArticles: number = 30): Promise<{ total: number; errors: number }> {
  await initDB()
  const enabledFeeds = await db.select().from(feeds).where(eq(feeds.enabled, true))

  let total = 0
  let errors = 0

  for (let i = 0; i < enabledFeeds.length; i += BATCH_SIZE) {
    if (total >= maxArticles) break

    const batch = enabledFeeds.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        let feedCount = 0
        const items = await parseFeed(feed.url)
        const perFeedLimit = Math.ceil(maxArticles / enabledFeeds.length)

        for (const item of items) {
          if (feedCount >= perFeedLimit) break
          if (!item.url) continue
          try {
            const { summary, titleZh } = await generateSummary(item.title, item.summary)
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
            feedCount++
          } catch (e) {
            console.error(`AI error for ${item.url}:`, e)
            throw e
          }
        }
        return feedCount
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        errors++
        continue
      }
      total += result.value
    }
  }

  return { total, errors }
}
// 向后兼容别名
export const crawlAllFeedsWithFeedId = crawlAllFeeds
