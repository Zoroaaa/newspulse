import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articles } from '@/lib/schema'
import { desc } from 'drizzle-orm'

// 提取标题关键词（过滤停用词，支持中英文）
function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'has', 'have',
    'will', 'can', 'how', 'what', 'why', 'who', 'its', 'as', 'be', 'this',
    'that', 'it', 'he', 'she', 'they', 'we', 'his', 'her', 'their', 'new',
    'over', 'after', 'says', 'said', 'amid', 'into', 'more', 'than',
  ])
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
}

// 基于关键词共现计算多源覆盖分（同一事件被多个不同来源报道=热点）
function clusterScore(article: { title: string; source: string }, others: { title: string; source: string }[]): number {
  const kw = extractKeywords(article.title)
  if (kw.length === 0) return 0
  const kwSet = new Set(kw)
  let score = 0
  const seenSources = new Set([article.source])

  for (const other of others) {
    if (seenSources.has(other.source)) continue // 同源重复不计
    const otherKw = extractKeywords(other.title)
    const matchCount = otherKw.filter(w => kwSet.has(w)).length
    const similarity = matchCount / Math.max(kw.length, otherKw.length, 1)
    if (similarity >= 0.3) {
      score += similarity * 20
      seenSources.add(other.source)
    }
  }
  return score
}

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '10'), 20)

  try {
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
    }).from(articles)
      .orderBy(desc(articles.publishedAt))
      .limit(150)

    const scored = recentArticles.map(article => {
      // 1. 新鲜度：优先用 publishedAt，越新越高
      const pubTime = article.publishedAt
        ? new Date(article.publishedAt).getTime()
        : new Date(article.createdAt).getTime()
      const ageHours = (Date.now() - pubTime) / (1000 * 60 * 60)
      const freshnessScore = Math.max(0, 1 - ageHours / 48) * 30

      // 2. 多源覆盖：多家媒体报道同一事件 → 热点
      const coverageScore = clusterScore(article, recentArticles.filter(o => o.id !== article.id))

      // 3. 内容质量
      const qualityScore = article.summary && article.summary.length > 80 ? 10 : 0

      return { ...article, _score: freshnessScore + coverageScore + qualityScore }
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
