import { NextRequest, NextResponse } from 'next/server'
import { translateArticle } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const { url, title } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  try {
    // Fetch article via server-side (bypasses CORS)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsPulse/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // Extract text content (basic extraction without cheerio server-side import issues)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)

    const { titleZh, contentZh } = await translateArticle(title, text)
    return NextResponse.json({ titleZh, contentZh, originalUrl: url })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
