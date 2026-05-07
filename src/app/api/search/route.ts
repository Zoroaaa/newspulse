import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc, or, like, and, eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const topic = req.nextUrl.searchParams.get('topic')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

  if (!q) {
    return NextResponse.json({ rows: [], hasMore: false })
  }

  try {
    const conditions = [
      like(articles.title, `%${q}%`),
      like(articles.titleZh, `%${q}%`),
      like(articles.summary, `%${q}%`),
    ]

    const where = topic
      ? and(eq(articles.topic, topic), or(...conditions))
      : or(...conditions)

    const rows = await db.select().from(articles)
      .where(where!)
      .orderBy(desc(articles.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({ rows, hasMore: rows.length >= limit })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
