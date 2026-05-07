import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc, eq, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30')

  try {
    let query = db.select().from(articles).orderBy(desc(articles.createdAt)).limit(limit)
    if (topic) {
      const rows = await db.select().from(articles)
        .where(eq(articles.topic, topic))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
      return NextResponse.json(rows)
    }

    // Group by topic
    const allTopics = await db.selectDistinct({ topic: articles.topic }).from(articles)
    const result: Record<string, any[]> = {}

    for (const { topic } of allTopics) {
      const rows = await db.select().from(articles)
        .where(eq(articles.topic, topic))
        .orderBy(desc(articles.createdAt))
        .limit(6)
      result[topic] = rows
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
