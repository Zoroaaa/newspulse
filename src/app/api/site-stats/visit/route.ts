import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { siteAccessStats } from '@/lib/schema'

export async function POST(req: NextRequest) {
  try {
    const userAgent = req.headers.get('user-agent') || null
    const referrer = req.headers.get('referer') || null
    
    await db.insert(siteAccessStats).values({
      userAgent,
      referrer,
    })
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error recording site visit:', error)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
