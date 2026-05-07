import { db } from './db'
import { feeds, articles } from './schema'
import { eq } from 'drizzle-orm'
import { parseFeed } from './rss-parser'
import { generateSummary } from './ai'
import { initDB } from './init-db'

const BATCH_SIZE = 5

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
        const items = await parseFeed(feed.url)
        const feedResults: { item: any; summary: string; titleZh: string }[] = []

        for (const item of items) {
          if (feedResults.length >= Math.ceil(maxArticles / enabledFeeds.length)) break
          if (!item.url) continue
          try {
            const { summary, titleZh } = await generateSummary(item.title, item.summary)
            feedResults.push({ item, summary, titleZh })
          } catch (e) {
            console.error(`AI error for ${item.url}:`, e)
          }
        }

        return feedResults
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        errors++
        continue
      }
      for (const { item, summary, titleZh } of result.value) {
        if (total >= maxArticles) break
        try {
          await db.insert(articles).values({
            feedId: 0,
            title: item.title,
            titleZh,
            url: item.url,
            summary,
            imageUrl: item.imageUrl,
            source: '',
            topic: '',
            publishedAt: item.publishedAt,
          }).onConflictDoNothing()
          total++
        } catch {}
      }
    }
  }

  return { total, errors }
}

export async function crawlAllFeedsWithFeedId(maxArticles: number = 30): Promise<{ total: number; errors: number }> {
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
        for (const item of items) {
          if (feedCount >= Math.ceil(maxArticles / enabledFeeds.length)) break
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
