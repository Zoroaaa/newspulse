/**
 * 文章相似度计算 - 统一给 page.tsx 和 ArticlePanel 使用
 */

export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'has', 'have',
  'will', 'can', 'how', 'what', 'why', 'who', 'its', 'as', 'be', 'this',
  'that', 'it', 'he', 'she', 'they', 'we', 'his', 'her', 'their', 'new',
  'over', 'after', 'says', 'said', 'amid', 'into', 'more', 'than', 'about',
  'report', 'reports', 'says', 'according', 'could', 'would', 'should',
])

export function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
}

/**
 * 计算两篇文章标题的相似度 [0, 1]
 * 同时满足：关键词Jaccard相似度 + 长实体词精确匹配
 */
export function titleSimilarity(titleA: string, titleB: string): number {
  const kwA = extractKeywords(titleA)
  const kwB = extractKeywords(titleB)
  if (kwA.length === 0 || kwB.length === 0) return 0

  const setA = new Set(kwA)
  const setB = new Set(kwB)

  // Jaccard: intersection / union
  let intersection = 0
  for (const w of setA) {
    if (setB.has(w)) intersection++
  }
  const union = setA.size + setB.size - intersection
  const jaccard = intersection / union

  // 长词（5字符以上）命中加权：人名、地名等实体词更有区分度
  const longWordsA = kwA.filter(w => w.length >= 5)
  let longHits = 0
  for (const w of longWordsA) {
    if (setB.has(w)) longHits++
  }
  const longBonus = longWordsA.length > 0 ? (longHits / longWordsA.length) * 0.2 : 0

  return Math.min(1, jaccard + longBonus)
}

/**
 * 判断两篇文章是否是"同一事件的多源报道"
 * 条件：来源不同 + 相似度超过阈值
 */
export function isSameEvent(a: { title: string; source: string }, b: { title: string; source: string }): boolean {
  if (a.source === b.source) return false // 同一来源不算多源
  return titleSimilarity(a.title, b.title) >= 0.35
}

/**
 * 从文章列表里找出与目标文章相关的文章
 * related: 同topic但非同一事件（真正的"相关阅读"）
 */
export function findRelated<T extends { id: number; title: string; source: string; topic: string }>(
  target: T,
  candidates: T[],
  limit = 5
): T[] {
  const others = candidates.filter(a => a.id !== target.id && a.topic === target.topic)
  
  // 按相似度排序，但排除"同一事件"（那些已经在多源报道里了）
  return others
    .map(a => ({ article: a, score: titleSimilarity(target.title, a.title) }))
    .filter(({ score }) => score < 0.35 && score > 0) // 不是同一事件但有一定关联
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ article }) => article)
}
