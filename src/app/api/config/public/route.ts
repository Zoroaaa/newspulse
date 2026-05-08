import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { config } from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'

const PUBLIC_KEYS = ['hero_topic'] as const

export async function GET() {
  const rows = await db.select().from(config).where(
    inArray(config.key, PUBLIC_KEYS)
  )
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return NextResponse.json(map)
}
