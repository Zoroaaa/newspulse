/**
 * 标题去重工具
 *
 * 为什么不用 URL 唯一约束就够：
 * - 同一篇文章可能被多个 feed 收录，URL 可能微差（http/https、trailing slash、query参数）
 * - 部分 RSS 源的文章 URL 会变化（重定向、CDN前缀变化）
 *
 * 方案：SimHash —— 对标题关键词做轻量特征哈希，相似度高于阈值则认为是同一篇
 */

import { extractKeywords } from './similarity'

// 简单的 32 位特征哈希（SimHash lite）
function simhash(title: string): number {
  const words = extractKeywords(title)
  if (words.length === 0) return 0

  const bits = new Array(32).fill(0)

  for (const word of words) {
    // 对每个词做 djb2 hash
    let h = 5381
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) + h + word.charCodeAt(i)) >>> 0
    }
    // 按位投票
    for (let i = 0; i < 32; i++) {
      bits[i] += (h >> i) & 1 ? 1 : -1
    }
  }

  let hash = 0
  for (let i = 0; i < 32; i++) {
    if (bits[i] > 0) hash |= (1 << i)
  }
  return hash >>> 0
}

// 汉明距离
function hammingDistance(a: number, b: number): number {
  let x = a ^ b
  let dist = 0
  while (x) {
    dist += x & 1
    x >>>= 1
  }
  return dist
}

// 相似度 [0,1]
function similarity(a: number, b: number): number {
  return 1 - hammingDistance(a, b) / 32
}

export interface TitleRecord {
  hash: number
  title: string
}

/**
 * 检查新标题是否与已有标题集合重复
 * 阈值 0.85：32位中允许最多4-5位差异
 */
export function isDuplicate(title: string, existing: TitleRecord[], threshold = 0.85): boolean {
  const hash = simhash(title)
  return existing.some(r => similarity(hash, r.hash) >= threshold)
}

export function makeRecord(title: string): TitleRecord {
  return { hash: simhash(title), title }
}