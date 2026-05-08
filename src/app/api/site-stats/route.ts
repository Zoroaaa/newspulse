import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { siteAccessStats } from '@/lib/schema'
import { sql, desc } from 'drizzle-orm'

export async function GET() {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    
    const allVisits = await db.select({ visitedAt: siteAccessStats.visitedAt }).from(siteAccessStats)
    
    const todayVisits = allVisits.filter(v => v.visitedAt && new Date(v.visitedAt) >= todayStart).length
    const yesterdayVisits = allVisits.filter(v => v.visitedAt && new Date(v.visitedAt) >= yesterdayStart && new Date(v.visitedAt) < todayStart).length
    const weekVisits = allVisits.filter(v => v.visitedAt && new Date(v.visitedAt) >= weekStart).length
    const totalVisits = allVisits.length
    
    const trend = yesterdayVisits > 0 ? ((todayVisits - yesterdayVisits) / yesterdayVisits * 100).toFixed(1) : null
    
    const recentVisits = await db
      .select({ visitedAt: siteAccessStats.visitedAt })
      .from(siteAccessStats)
      .orderBy(desc(siteAccessStats.visitedAt))
      .limit(10)
    
    return NextResponse.json({
      total: totalVisits,
      today: todayVisits,
      yesterday: yesterdayVisits,
      week: weekVisits,
      trend: trend ? Number(trend) : 0,
      recentVisits: recentVisits.map(v => v.visitedAt),
    })
  } catch (error) {
    console.error('Error fetching site stats:', error)
    return NextResponse.json({ 
      total: 0, 
      today: 0, 
      yesterday: 0, 
      week: 0, 
      trend: 0,
      recentVisits: [] 
    }, { status: 200 })
  }
}
