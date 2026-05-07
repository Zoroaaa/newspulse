import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../src/lib/schema'
import { crawlAllFeedsWithProgress } from '../src/lib/crawl-utils'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})
const db = drizzle(client, { schema })

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
    process.exit(1)
  }

  let totalFeeds = 0

  const { total, errors } = await crawlAllFeedsWithProgress(undefined, (event) => {
    switch (event.type) {
      case 'start':
        totalFeeds = event.totalFeeds
        console.log(`\n📰 NewsPulse Crawler`)
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`Found ${event.totalFeeds} enabled feeds (max ${event.perFeedLimit} articles/feed)`)
        break
      case 'feed_start':
        console.log(`\n[${event.feedIndex + 1}/${event.totalFeeds}] 📡 ${event.feedName}`)
        break
      case 'article':
        console.log(`   ├─ ${event.title.slice(0, 70)}${event.title.length > 70 ? '...' : ''}`)
        break
      case 'feed_done':
        if (event.error) {
          console.log(`   └─ ❌ FAILED: ${event.error}`)
        } else {
          console.log(`   └─ ✅ saved:${event.saved} skipped:${event.skipped}`)
        }
        break
      case 'error':
        console.error(`   ⚠️  ${event.message}`)
        break
      case 'done':
        break
    }
  })

  const successRate = totalFeeds > 0 ? (((totalFeeds - errors) / totalFeeds) * 100).toFixed(1) : '0.0'
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📊 Summary:`)
  console.log(`   Total articles processed: ${total}`)
  console.log(`   Feeds with errors: ${errors}`)
  console.log(`   Success rate: ${successRate}%`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})