import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc, eq, count, inArray, sql } from 'drizzle-orm'

const DEFAULT_LIMIT = 6

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT)), 50)
  const countOnly = req.nextUrl.searchParams.get('count') === 'true'

  try {
    if (countOnly) {
      const [{ total }] = await db.select({ total: count() }).from(articles)
      return NextResponse.json({ total })
    }

    if (topic) {
      const rows = await db.select().from(articles)
        .where(eq(articles.topic, topic))
        .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
        .limit(limit)
        .offset(offset)

      const [{ total }] = await db.select({ total: count() })
        .from(articles)
        .where(eq(articles.topic, topic))

      console.log('[API/articles] Load more sample:', {
        topic,
        offset,
        firstRow: rows[0] ? {
          id: rows[0].id,
          publishedAt: rows[0].publishedAt,
          publishedAtType: typeof rows[0].publishedAt,
          createdAt: rows[0].createdAt,
          createdAtType: typeof rows[0].createdAt,
        } : null
      })

      return NextResponse.json({ rows, hasMore: offset + rows.length < total })
    }

    // 初始加载：用一次查询拿到所有topic + 每个topic最新的N篇
    // 先拿全部 topics
    const topicRows = await db.selectDistinct({ topic: articles.topic }).from(articles)
    const topics = topicRows.map(r => r.topic)

    if (topics.length === 0) return NextResponse.json({})

    // 用 ROW_NUMBER 窗口函数一次拿所有数据（SQLite 3.25+ 支持）
    // 若不支持则回退到多次查询
    try {
      const ranked = await db.all(sql`
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY topic
            ORDER BY COALESCE(published_at, created_at) DESC
          ) as rn
          FROM articles
        ) ranked
        WHERE rn <= ${DEFAULT_LIMIT}
        ORDER BY topic, rn
      `) as any[]

      const result: Record<string, any[]> = {}
      for (const row of ranked) {
        const { rn, published_at, created_at, title_zh, image_url, feed_id, ...rest } = row

        const article = {
          ...rest,
          titleZh: title_zh,
          imageUrl: image_url,
          feedId: feed_id,
          publishedAt: published_at ? (typeof published_at === 'number' ? new Date(published_at * 1000).toISOString() : published_at) : null,
          createdAt: created_at ? (typeof created_at === 'number' ? new Date(created_at * 1000).toISOString() : created_at) : null,
        }

        if (!result[article.topic]) result[article.topic] = []
        result[article.topic].push(article)
      }
      // 保持 topics 顺序
      const ordered: Record<string, any[]> = {}
      for (const t of topics) {
        ordered[t] = result[t] || []
      }

      console.log('[API/articles] Initial load sample:', {
        firstTopic: topics[0],
        firstArticle: ordered[topics[0]]?.[0] ? {
          id: ordered[topics[0]][0].id,
          publishedAt: ordered[topics[0]][0].publishedAt,
          publishedAtType: typeof ordered[topics[0]][0].publishedAt,
          createdAt: ordered[topics[0]][0].createdAt,
          createdAtType: typeof ordered[topics[0]][0].createdAt,
        } : null
      })

      return NextResponse.json(ordered)
    } catch (e) {
      console.error('[API/articles] Window function error, falling back:', e)
      // 回退：N+1，逐 topic 查询（保留原有行为）
      const result: Record<string, any[]> = {}
      for (const t of topics) {
        const rows = await db.select().from(articles)
          .where(eq(articles.topic, t))
          .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
          .limit(DEFAULT_LIMIT)
        result[t] = rows
      }
      return NextResponse.json(result)
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
