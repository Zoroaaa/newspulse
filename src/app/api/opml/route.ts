import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { feeds } from '@/lib/schema'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const allFeeds = await db.select().from(feeds).orderBy(feeds.topic, feeds.name)

  const byTopic: Record<string, typeof allFeeds> = {}
  for (const f of allFeeds) {
    ;(byTopic[f.topic] ??= []).push(f)
  }

  const outlines = Object.entries(byTopic).map(([topic, items]) => {
    const children = items.map(f =>
      `      <outline type="rss" text="${esc(f.name)}" title="${esc(f.name)}" xmlUrl="${esc(f.url)}" />`
    ).join('\n')
    return `    <outline text="${esc(topic)}" title="${esc(topic)}">\n${children}\n    </outline>`
  }).join('\n')

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>NewsPulse Subscriptions</title>
  </head>
  <body>
${outlines}
  </body>
</opml>`

  return new NextResponse(opml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="newspulse-feeds.opml"',
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const body = await req.text()

  const outlines = [...body.matchAll(/<outline[^>]*?(?:text|title)="([^"]*)"[^>]*?xmlUrl="([^"]*)"[^>]*?\/?>/gi)]
  if (outlines.length === 0) {
    const nested = [...body.matchAll(/<outline[^>]*?(?:text|title)="([^"]*)"[^>]*?>[\s\S]*?<outline[^>]*?(?:text|title)="([^"]*)"[^>]*?xmlUrl="([^"]*)"[^>]*?\/?>/gi)]
    if (nested.length === 0) {
      return NextResponse.json({ error: 'No RSS feeds found in OPML' }, { status: 400 })
    }
  }

  const existing = await db.select({ url: feeds.url }).from(feeds)
  const existingUrls = new Set(existing.map(e => e.url))

  let imported = 0
  let skipped = 0

  const topicMatches = [...body.matchAll(/<outline[^>]*?(?:text|title)="([^"]*)"[^>]*?>\s*([\s\S]*?)\s*<\/outline>/gi)]

  if (topicMatches.length > 0) {
    for (const topicMatch of topicMatches) {
      const topic = topicMatch[1]
      const inner = topicMatch[2]
      const feedMatches = [...inner.matchAll(/<outline[^>]*?(?:text|title)="([^"]*)"[^>]*?xmlUrl="([^"]*)"[^>]*?\/?>/gi)]
      for (const fm of feedMatches) {
        const name = fm[1]
        const url = fm[2]
        if (existingUrls.has(url)) { skipped++; continue }
        try {
          await db.insert(feeds).values({ name, url, topic, enabled: true, isBuiltin: false })
          existingUrls.add(url)
          imported++
        } catch { skipped++ }
      }
    }
  } else {
    for (const m of outlines) {
      const name = m[1]
      const url = m[2]
      if (existingUrls.has(url)) { skipped++; continue }
      try {
        await db.insert(feeds).values({ name, url, topic: '未分类', enabled: true, isBuiltin: false })
        existingUrls.add(url)
        imported++
      } catch { skipped++ }
    }
  }

  return NextResponse.json({ ok: true, imported, skipped })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
