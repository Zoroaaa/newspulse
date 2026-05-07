import { NextRequest, NextResponse } from 'next/server'

// 允许代理的图片域名（防止被当开放代理滥用）
// 留空则允许所有域名，生产环境建议填写你的 RSS 源域名
const ALLOWED_DOMAINS: string[] = []

// 缓存时长（秒）
const CACHE_TTL = 60 * 60 * 24 // 24小时

function isAllowed(url: string): boolean {
  if (ALLOWED_DOMAINS.length === 0) return true
  try {
    const { hostname } = new URL(url)
    return ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  if (!isAllowed(url)) {
    return new NextResponse('Domain not allowed', { status: 403 })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsPulse/1.0)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': new URL(url).origin,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!upstream.ok) {
      return new NextResponse('Upstream error', { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'

    // 只代理图片类型
    if (!contentType.startsWith('image/')) {
      return new NextResponse('Not an image', { status: 400 })
    }

    const body = await upstream.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
        'X-Proxy-Source': 'newspulse',
      },
    })
  } catch (e) {
    return new NextResponse('Proxy failed', { status: 502 })
  }
}