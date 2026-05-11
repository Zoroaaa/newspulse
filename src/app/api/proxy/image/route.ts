export const runtime = 'edge'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url')

  if (!url) {
    return new Response('missing url', { status: 400 })
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return new Response('invalid url', { status: 400 })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return new Response('invalid protocol', { status: 400 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsPulse/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': target.origin,
      },
      // Edge Runtime 不支持 AbortSignal.timeout，用 signal + setTimeout 模拟
      signal: AbortSignal.timeout(10000),
    })

    if (!upstream.ok) {
      console.error(`[proxy/image] upstream ${upstream.status} for ${url}`)
      return new Response(`upstream error: ${upstream.status}`, { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') || ''
    const baseType = contentType.split(';')[0].trim()
    if (!ALLOWED_CONTENT_TYPES.includes(baseType)) {
      console.error(`[proxy/image] rejected content-type "${contentType}" for ${url}`)
      return new Response(`unsupported content-type: ${contentType}`, { status: 415 })
    }

    const contentLength = upstream.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return new Response('image too large', { status: 413 })
    }

    // 流式转发，不缓冲到内存
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Proxy-Source': target.hostname,
      },
    })
  } catch (e) {
    console.error(`[proxy/image] fetch error for ${url}:`, e)
    return new Response(`fetch failed: ${String(e)}`, { status: 502 })
  }
}
