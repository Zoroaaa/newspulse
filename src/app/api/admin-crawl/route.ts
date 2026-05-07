import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { crawlAllFeedsWithFeedId } from '@/lib/crawl-utils'

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const { total, errors } = await crawlAllFeedsWithFeedId(30)
  return NextResponse.json({ ok: true, processed: total, errors })
}
