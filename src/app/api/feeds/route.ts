import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { feeds } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  const rows = await db.select().from(feeds).orderBy(feeds.topic, feeds.name)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const { name, url, topic } = await req.json()
  if (!name || !url || !topic) {
    return NextResponse.json({ error: 'name, url, topic required' }, { status: 400 })
  }

  const [row] = await db.insert(feeds).values({ name, url, topic, enabled: true, isBuiltin: false }).returning()
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const { id, enabled, name, topic } = await req.json()
  const update: any = {}
  if (enabled !== undefined) update.enabled = enabled
  if (name) update.name = name
  if (topic) update.topic = topic

  await db.update(feeds).set(update).where(eq(feeds.id, id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req)
  if (auth) return auth

  const { id } = await req.json()
  await db.delete(feeds).where(eq(feeds.id, id))
  return NextResponse.json({ ok: true })
}
