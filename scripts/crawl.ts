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

  const perFeedLimit = Number(process.env.PER_FEED_LIMIT) || 6
  console.log(`Starting crawl: max ${perFeedLimit} articles per feed`)

  const { total, errors } = await crawlAllFeedsWithProgress(perFeedLimit, (event) => {
    switch (event.type) {
      case 'start':
        console.log(`Found ${event.totalFeeds} enabled feeds`)
        break
      case 'feed_start':
        console.log(`\n[${event.feedIndex + 1}/${event.totalFeeds}] ${event.feedName}`)
        break
      case 'article':
        console.log(`  → ${event.title.slice(0, 80)}`)
        break
      case 'feed_done':
        console.log(`  ✓ saved:${event.saved} skipped:${event.skipped}${event.error ? ` error:${event.error}` : ''}`)
        break
      case 'error':
        console.error(`  ✗ ${event.message}`)
        break
      case 'done':
        break
    }
  })

  console.log(`\nDone: ${total} processed, ${errors} errors`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})