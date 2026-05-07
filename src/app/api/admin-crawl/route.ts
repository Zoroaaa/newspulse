import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { crawlAllFeedsWithProgress } from '@/lib/crawl-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await crawlAllFeedsWithProgress(undefined, send)
        send({ type: 'done' })
      } catch (e) {
        send({ type: 'error', message: String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}