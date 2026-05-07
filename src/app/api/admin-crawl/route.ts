import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { feeds, articles } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { parseFeed } from '@/lib/rss-parser'
import { generateSummary } from '@/lib/ai'
import { initDB } from '@/lib/init-db'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  await initDB()
  const enabledFeeds = await db.select().from(feeds).where(eq(feeds.enabled, true))
  let total = 0
  const MAX_ARTICLES = 30

  for (const feed of enabledFeeds) {
    if (total >= MAX_ARTICLES) break
    try {
      const items = await parseFeed(feed.url)
      for (const item of items) {
        if (total >= MAX_ARTICLES) break
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
