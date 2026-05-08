import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { initDB } from '@/lib/init-db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  try {
    await initDB()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
