import { XMLParser } from 'fast-xml-parser'

export interface ParsedArticle {
  title: string
  url: string
  summary: string
  imageUrl: string | null
  publishedAt: Date | null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
})

function extractImage(item: any): string | null {
  // media:content
  if (item['media:content']?.['@_url']) return item['media:content']['@_url']
  if (Array.isArray(item['media:content'])) {
    const found = item['media:content'].find((m: any) => m['@_url'])
    if (found) return found['@_url']
  }
  // media:thumbnail
  if (item['media:thumbnail']?.['@_url']) return item['media:thumbnail']['@_url']
  // enclosure
  if (item.enclosure?.['@_url'] && item.enclosure?.['@_type']?.startsWith('image')) {
    return item.enclosure['@_url']
  }
  // og image in description
  const desc = item.description || item['content:encoded'] || ''
  const match = desc.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (match) return match[1]
  return null
}

function extractText(val: any): string {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) {
    // Atom feed 的 <link href="..."> 解析为 { '@_href': '...' }
    if (val['@_href']) return val['@_href']
    return val['#text'] || val._ || ''
  }
  return ''
}

// Atom feed 的 link 字段可能是数组（alternate + self 等多个 rel）
function extractLink(linkVal: any): string {
  if (!linkVal) return ''
  // 数组：取 rel=alternate 或第一个有 href 的
  if (Array.isArray(linkVal)) {
    const alt = linkVal.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel'])
    const found = alt ?? linkVal.find((l: any) => l['@_href'])
    return found?.['@_href'] ?? ''
  }
  return extractText(linkVal)
}

export async function parseFeed(url: string, limit = 20): Promise<ParsedArticle[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NewsPulse/1.0 RSS Reader' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
  const text = await res.text()
  const data = parser.parse(text)

  let items: any[] = []

  if (data.rss?.channel?.item) {
    items = Array.isArray(data.rss.channel.item) ? data.rss.channel.item : [data.rss.channel.item]
  } else if (data.feed?.entry) {
    items = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry]
  }

  return items.slice(0, limit).map((item: any) => {
    const title = extractText(item.title || item.name || '')
    const link = extractLink(item.link || item.url || item.id || '')
    const description = extractText(item.description || item.summary || item['content:encoded'] || '')
    const summary = description.replace(/<[^>]*>/g, '').slice(0, 300).trim()
    const pubDate = item.pubDate || item.published || item.updated || null
    const imageUrl = extractImage(item)

    return {
      title,
      url: link,
      summary,
      imageUrl,
      publishedAt: pubDate ? new Date(pubDate) : null,
    }
  }).filter(a => a.title && a.url)
}
