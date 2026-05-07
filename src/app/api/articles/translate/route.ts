import { NextRequest, NextResponse } from 'next/server'
import { translateTitles } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const { titles } = await req.json()
  if (!titles || !Array.isArray(titles)) {
    return NextResponse.json({ error: 'titles array required' }, { status: 400 })
  }
  try {
    const map = await translateTitles(titles)
    return NextResponse.json(map)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
