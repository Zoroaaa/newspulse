import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { translateArticle } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const { url, title } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsPulse/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const $ = cheerio.load(html)

    $('script, style, nav, header, footer, aside, iframe, noscript, [role="navigation"], [role="banner"], [role="contentinfo"]').remove()

    let contentEl = $('article').first()
    if (!contentEl.length) contentEl = $('[role="main"]').first()
    if (!contentEl.length) contentEl = $('main').first()
    if (!contentEl.length) contentEl = $('.post-content, .article-content, .entry-content, .story-body, .article__body').first()
    if (!contentEl.length) contentEl = $('body')

    const paragraphs: string[] = []
    contentEl.find('p, h1, h2, h3, h4, h5, h6').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 20) paragraphs.push(text)
    })

    let text = paragraphs.join('\n\n')
    if (text.length < 100) {
      text = contentEl.text().replace(/\s+/g, ' ').trim()
    }

    text = text.slice(0, 30000)

    const { titleZh, contentZh } = await translateArticle(title, text)
    return NextResponse.json({ titleZh, contentZh, originalUrl: url })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
