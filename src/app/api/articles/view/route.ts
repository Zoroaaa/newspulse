import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { articleViews } from '@/lib/schema'

export async function POST(req: NextRequest) {
  const { id } = await req.json()
  if (!id || typeof id !== 'number') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  try {
    await db.insert(articleViews).values({ articleId: id })
    return NextResponse.json({ ok: true })
  } catch {
    // 忽略写入失败（文章不存在等），不影响前端体验
    return NextResponse.json({ ok: true })
  }
}
