import { NextRequest, NextResponse } from 'next/server'

export function requireAdmin(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get('admin_token')
  if (cookie?.value === process.env.ADMIN_PASSWORD) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
