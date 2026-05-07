import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { config } from '@/lib/schema'
import { requireAdmin } from '@/lib/auth'
import { sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const rows = await db.select().from(config)
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  // Mask API key
  if (map.ai_api_key) map.ai_api_key = '••••••••' + map.ai_api_key.slice(-4)
  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const body = await req.json()
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.startsWith('••••••••')) continue
    await db.run(sql`INSERT INTO config (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT(key) DO UPDATE SET value = ${String(value)}, updated_at = unixepoch()`)
  }
  return NextResponse.json({ ok: true })
}
