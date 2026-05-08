'use client'

import { useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// 使用与 page.tsx 一致的完整 Article 类型
interface Article {
  id: number
  title: string
  titleZh: string | null
  url: string
  summary: string | null
  imageUrl: string | null
  source: string
  topic: string
  publishedAt: string | null
  createdAt: string
}

interface Props {
  articles: Article[]
  translated: boolean
  onSelect: (article: Article) => void
}

export default function HeadlineCarousel({ articles, translated, onSelect }: Props) {
  const carouselRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return
    const scrollAmount = carouselRef.current.offsetWidth * 0.6
    carouselRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  if (articles.length === 0) return null

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>📰 今日头条</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => scroll('left')} style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '0.5px solid var(--border)', background: 'var(--bg-card)',
            cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#D85A30' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >&rsaquo;</button>
          <button onClick={() => scroll('right')} style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '0.5px solid var(--border)', background: 'var(--bg-card)',
            cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#D85A30' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >&lsaquo;</button>
        </div>
      </div>

      <div ref={carouselRef} style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        paddingBottom: 8,
      }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>

        {articles.map((article, i) => (
          <div key={article.id} onClick={() => onSelect(article)} style={{
            flex: '0 0 calc(33.333% - 12px)',
            scrollSnapAlign: 'start',
            cursor: 'pointer',
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: 10,
            padding: 14,
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
            e.currentTarget.style.borderColor = '#D85A30'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          >
            {article.imageUrl && (
              <img src={article.imageUrl} alt="" style={{
                width: '100%',
                height: 180,
                objectFit: 'cover',
                borderRadius: 8,
                marginBottom: 10,
              }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            {!article.imageUrl && (
              <div style={{
                width: '100%',
                height: 180,
                background: 'linear-gradient(135deg, var(--bg-hover), var(--border))',
                borderRadius: 8,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
              }}>📰</div>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#D85A30', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
              {article.topic}
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 4, color: 'var(--text-primary)' }}>
              {(translated && article.titleZh ? article.titleZh : article.title).length > 80 
                ? (translated && article.titleZh ? article.titleZh : article.title).slice(0, 80) + '...' 
                : (translated && article.titleZh ? article.titleZh : article.title)}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {article.source} · {formatDistanceToNow(new Date(article.publishedAt || new Date()), { locale: zhCN, addSuffix: true })}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
