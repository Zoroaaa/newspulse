import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000)
    const todayStart = now - (now % 86400)          // 今日 00:00 UTC
    const yesterdayStart = todayStart - 86400
    const weekStart = todayStart - 86400 * 7

    const [row] = await db.all(sql`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE visited_at >= ${todayStart})            AS today,
        COUNT(*) FILTER (WHERE visited_at >= ${yesterdayStart}
                           AND visited_at <  ${todayStart})            AS yesterday,
        COUNT(*) FILTER (WHERE visited_at >= ${weekStart})             AS week
      FROM site_access_stats
    `) as any[]

    const today     = Number(row.today)
    const yesterday = Number(row.yesterday)
    const trend     = yesterday > 0 ? (today - yesterday) / yesterday * 100 : 0

    return NextResponse.json({
      total:     Number(row.total),
      today,
      yesterday,
      week:      Number(row.week),
      trend:     Math.round(trend * 10) / 10,
    })
  } catch (error) {
    console.error('Error fetching site stats:', error)
    return NextResponse.json({ total: 0, today: 0, yesterday: 0, week: 0, trend: 0 })
  }
}
