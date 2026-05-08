import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles, articleViews } from '@/lib/schema'
import { desc, gte, sql, eq } from 'drizzle-orm'
import { extractKeywords } from '@/lib/similarity'

type ArticleRow = {
  id: number; title: string; titleZh: string | null; url: string
  summary: string | null; imageUrl: string | null; source: string
  topic: string; publishedAt: Date | null; createdAt: Date
}

// 预计算好所有文章的关键词集，外部传入，避免重复计算
function clusterScore(
  article: ArticleRow,
  articleIdx: number,
  allKwSets: Set<string>[],
  allSources: string[]
): number {
  const kwSet = allKwSets[articleIdx]
  if (kwSet.size === 0) return 0

  let score = 0
  const seenSources = new Set([article.source])

  for (let j = 0; j < allKwSets.length; j++) {
    if (j === articleIdx) continue
    if (seenSources.has(allSources[j])) continue

    const otherSet = allKwSets[j]
    let matchCount = 0
    for (const w of otherSet) {
      if (kwSet.has(w)) matchCount++
    }
    const similarity = matchCount / Math.max(kwSet.size, otherSet.size, 1)
    if (similarity >= 0.3) {
      score += similarity * 20
      seenSources.add(allSources[j])
    }
  }
  return score
}

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '10'), 20)

  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const recentArticles = await db.select({
      id: articles.id,
      title: articles.title,
      titleZh: articles.titleZh,
      url: articles.url,
      summary: articles.summary,
      imageUrl: articles.imageUrl,
      source: articles.source,
      topic: articles.topic,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      viewCount: sql<number>`(
        SELECT COUNT(*) FROM article_views
        WHERE article_id = ${articles.id}
        AND viewed_at >= ${Math.floor(cutoff.getTime() / 1000)}
      )`,
    }).from(articles)
      .orderBy(desc(articles.publishedAt))
      .limit(150)

    // 预计算每篇文章的关键词集，后续 clusterScore 直接查表，不重复 extractKeywords
    const kwSets = recentArticles.map(a => new Set(extractKeywords(a.title)))
    const sources = recentArticles.map(a => a.source)

    const scored = recentArticles.map((article, idx) => {
      const pubTime = article.publishedAt
        ? new Date(article.publishedAt).getTime()
        : new Date(article.createdAt).getTime()
      const ageHours = (Date.now() - pubTime) / (1000 * 60 * 60)
      const freshnessScore = Math.max(0, 1 - ageHours / 48) * 30
      const coverageScore = clusterScore(article, idx, kwSets, sources)
      const qualityScore = article.summary && article.summary.length > 80 ? 10 : 0
      // 近48h阅读量：每次阅读+2分，上限20分
      const viewScore = Math.min((article.viewCount ?? 0) * 2, 20)
      return { ...article, _score: freshnessScore + coverageScore + qualityScore + viewScore }
    })

    scored.sort((a, b) => b._score - a._score)

    // 去重：同一事件只保留分最高那篇
    const seen = new Set<string>()
    const deduped: typeof scored = []
    for (const article of scored) {
      const kw = extractKeywords(article.title).slice(0, 3).join('|')
      if (!seen.has(kw)) {
        seen.add(kw)
        deduped.push(article)
      }
      if (deduped.length >= limit) break
    }

    return NextResponse.json(deduped.map(({ _score, ...a }) => a))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
