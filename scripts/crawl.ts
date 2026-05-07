import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../src/lib/schema'
import { parseFeed } from '../src/lib/rss-parser'
import { generateSummary, getAIConfig } from '../src/lib/ai'
import { initDB } from '../src/lib/init-db'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})
const db = drizzle(client, { schema })

const PER_FEED_LIMIT = Number(process.env.PER_FEED_LIMIT) || 6
const BATCH_SIZE = 5

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
    process.exit(1)
  }

  await initDB()

  const cfg = await getAIConfig()
  if (!cfg.apiKey) {
    console.error('AI API Key not configured')
    process.exit(1)
  }

  const enabledFeeds = await db.select().from(schema.feeds).where(eq(schema.feeds.enabled, true))
  console.log(`Found ${enabledFeeds.length} enabled feeds, max ${PER_FEED_LIMIT} per feed`)

  let total = 0
  let errors = 0

  for (let i = 0; i < enabledFeeds.length; i += BATCH_SIZE) {
    const batch = enabledFeeds.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        let feedCount = 0
        const items = await parseFeed(feed.url)
        for (const item of items) {
          if (feedCount >= PER_FEED_LIMIT) break
          if (!item.url) continue
          try {
            const { summary, titleZh } = await generateSummary(item.title, item.summary)
            await db.insert(schema.articles).values({
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
            console.log(`[${feed.name}] [${feedCount}/${PER_FEED_LIMIT}] ${item.title.slice(0, 60)} → ${titleZh}`)
          } catch (e) {
            console.error(`  AI error for ${item.url}:`, e)
            throw e
          }
        }
        return feedCount
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        total += result.value
      } else {
        errors++
      }
    }
  }

  console.log(`Done: ${total} processed, ${errors} errors`)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
