'use client'

import { useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { proxyImage } from '@/lib/proxy'

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
    carouselRef.current.scrollBy({
      left: direction === 'left' ? -(carouselRef.current.offsetWidth * 0.6) : carouselRef.current.offsetWidth * 0.6,
      behavior: 'smooth'
    })
  }

  if (articles.length === 0) return null

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}>
            今日头条
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => scroll('left')} className="carousel-nav-btn">&lsaquo;</button>
          <button onClick={() => scroll('right')} className="carousel-nav-btn">&rsaquo;</button>
        </div>
      </div>

      <div ref={carouselRef} className="carousel-wrap">
        {articles.map((article) => {
          const title = translated && article.titleZh ? article.titleZh : article.title
          const timeStr = (() => {
            try {
              return formatDistanceToNow(new Date(article.publishedAt || article.createdAt), { locale: zhCN, addSuffix: true })
            } catch { return '' }
          })()

          return (
            <div key={article.id} className="carousel-card" onClick={() => onSelect(article)}>
              {/* Image area */}
              <div style={{ height: 160, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                {article.imageUrl ? (
                  <img
                    src={proxyImage(article.imageUrl) || article.imageUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      if (img.src !== article.imageUrl) img.src = article.imageUrl!
                      else (img.parentElement as HTMLElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-hover)',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--text-faint)',
                    }}>{article.source}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--accent)',
                  marginBottom: 6,
                }}>
                  {article.topic}
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: 'var(--text-primary)',
                  marginBottom: 8,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {title}
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--text-faint)',
                  }}>{article.source}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
                    {timeStr}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
