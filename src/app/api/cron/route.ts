import { NextRequest, NextResponse } from 'next/server'
import { crawlAllFeedsWithFeedId } from '@/lib/crawl-utils'
import { db } from '@/lib/db'
import { config, articles } from '@/lib/schema'
import { eq, lt, sql } from 'drizzle-orm'

async function cleanupOldArticles(): Promise<number> {
  const rows = await db.select().from(config).where(eq(config.key, 'retention_days'))
  const days = rows.length > 0 ? parseInt(rows[0].value, 10) : 30
  if (isNaN(days) || days <= 0) return 0

  const cutoff = new Date(Date.now() - days * 86400 * 1000)
  const result = await db.delete(articles).where(lt(articles.createdAt, cutoff))
  return result.rowsAffected ?? 0
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [{ total, errors }, cleaned] = await Promise.all([
    crawlAllFeedsWithFeedId(30),
    cleanupOldArticles(),
  ])
  return NextResponse.json({ ok: true, processed: total, errors, cleaned })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
