import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { feeds, articles } from '@/lib/schema'
import { eq, and } from 'drizzle-orm'
import { parseFeed } from '@/lib/rss-parser'
import { generateSummary } from '@/lib/ai'
import { initDB } from '@/lib/init-db'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await initDB()
  const enabledFeeds = await db.select().from(feeds).where(eq(feeds.enabled, true))
  let total = 0

  for (const feed of enabledFeeds) {
    try {
      const items = await parseFeed(feed.url)
      for (const item of items) {
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
          total++
        } catch {}
      }
    } catch (e) {
      console.error(`Feed ${feed.name} failed:`, e)
    }
  }

  return NextResponse.json({ ok: true, processed: total })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
