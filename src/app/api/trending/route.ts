import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc, sql } from 'drizzle-orm'

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.min(wordsA.size, wordsB.size)
}

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '10'), 20)

  try {
    const recentArticles = await db.select().from(articles)
      .orderBy(desc(articles.createdAt))
      .limit(200)

    const scored = recentArticles.map(article => {
      let score = 0

      const ageMs = Date.now() - new Date(article.createdAt).getTime()
      const ageHours = ageMs / (1000 * 60 * 60)
      score += Math.max(0, 48 - ageHours) * 2

      const similarCount = recentArticles.filter(other =>
        other.id !== article.id &&
        other.topic === article.topic &&
        titleSimilarity(article.title, other.title) > 0.4
      ).length
      score += similarCount * 15

      if (article.summary && article.summary.length > 50) score += 5

      return { ...article, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    const trending = scored.slice(0, limit).map(({ _score, ...article }) => article)

    return NextResponse.json(trending)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
