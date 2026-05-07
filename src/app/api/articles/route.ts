import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc, eq, sql, count } from 'drizzle-orm'

const DEFAULT_LIMIT = 6

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT)), 50)

  try {
    if (topic) {
      const rows = await db.select().from(articles)
        .where(eq(articles.topic, topic))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset)

      const [{ total }] = await db.select({ total: count() })
        .from(articles)
        .where(eq(articles.topic, topic))

      return NextResponse.json({ rows, hasMore: offset + rows.length < total })
    }

    const allTopics = await db.selectDistinct({ topic: articles.topic }).from(articles)
    const result: Record<string, any[]> = {}

    for (const { topic: t } of allTopics) {
      const rows = await db.select().from(articles)
        .where(eq(articles.topic, t))
        .orderBy(desc(articles.createdAt))
        .limit(DEFAULT_LIMIT)
      result[t] = rows
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
