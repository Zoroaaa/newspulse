'use client'

import { useState, useEffect, useRef } from 'react'
import { findRelated } from '@/lib/similarity'
import { proxyImage } from '@/lib/proxy'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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
  viewCount?: number
}

interface Props {
  article: Article
  translated: boolean
  bookmarked: boolean
  onToggleBookmark: () => void
  onClose: () => void
  similar?: Article[]
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: zhCN, addSuffix: true })
  } catch { return '' }
}

export default function ArticlePanel({ article, translated, bookmarked, onToggleBookmark, onClose, similar }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ titleZh: string; contentZh: string } | null>(null)
  const [related, setRelated] = useState<Article[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState('idle')
    setResult(null)
    setRelated([])

    fetch(`/api/articles?topic=${encodeURIComponent(article.topic)}&limit=30`)
      .then(r => r.json())
      .then(data => {
        const rows: Article[] = data.rows || data[article.topic] || []
        const sameEventIds = new Set((similar || []).map(a => a.id))
        const candidates = rows.filter(a => a.id !== article.id && !sameEventIds.has(a.id))
        setRelated(findRelated(article, candidates, 5))
      })
      .catch(() => {})
  }, [article.id, article.topic, similar])

  const handleTranslate = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/fetch-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url, title: article.title }),
      })
      if (!res.ok) throw new Error('fetch failed')
      setResult(await res.json())
      setState('done')
    } catch {
      setState('error')
    }
  }

  const displayTitle = state === 'done' && result
    ? result.titleZh
    : (translated && article.titleZh ? article.titleZh : article.title)

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />

      <div ref={panelRef} className="panel slide-in">

        {/* Header */}
        <div className="panel-header">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <span className="panel-topic-tag">{article.topic}</span>
            <span className="panel-source">{article.source}</span>
            {article.viewCount !== undefined && article.viewCount > 0 && (
              <span className="panel-view-count">· {article.viewCount} 阅</span>
            )}
            {article.publishedAt && (
              <span className="panel-view-count hide-mobile">{timeAgo(article.publishedAt)}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={onToggleBookmark}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, color: bookmarked ? 'var(--accent)' : 'var(--text-faint)',
                padding: '4px 6px', transition: 'color 0.15s, transform 0.15s',
                lineHeight: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {bookmarked ? '★' : '☆'}
            </button>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="panel-orig-link">
              原文 ↗
            </a>
            <button onClick={onClose} className="panel-close-btn">×</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="panel-content">

          {/* Title */}
          <h1 className="panel-title">{displayTitle}</h1>

          {/* Image */}
          {article.imageUrl && (
            <div style={{ marginBottom: '1.5rem', borderRadius: 10, overflow: 'hidden' }}>
              <img
                src={proxyImage(article.imageUrl)!}
                alt=""
                style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement
                  if (img.src !== article.imageUrl) img.src = article.imageUrl!
                  else (img.parentElement as HTMLElement).style.display = 'none'
                }}
              />
            </div>
          )}

          {/* AI summary */}
          {article.summary && state !== 'done' && (
            <div className="panel-ai-box">
              <div className="panel-ai-label">✦ AI 摘要</div>
              <p className="panel-ai-text">{article.summary}</p>
            </div>
          )}

          {/* Translate CTA */}
          {state === 'idle' && (
            <button onClick={handleTranslate} className="panel-translate-btn">
              AI 翻译全文
            </button>
          )}

          {state === 'loading' && (
            <div style={{
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              letterSpacing: '0.06em',
            }}>
              正在抓取并翻译···
            </div>
          )}

          {state === 'error' && (
            <div style={{
              background: 'var(--error-bg)',
              border: '0.5px solid var(--error-border)',
              borderRadius: 10,
              padding: '14px 18px',
              color: 'var(--error-text)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              该页面无法访问，可能有防抓取限制。
              <br />
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                前往原文阅读 ↗
              </a>
            </div>
          )}

          {state === 'done' && result && (
            <div className="panel-body-text">
              {result.contentZh.split('\n').filter(Boolean).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          {/* Multi-source coverage */}
          {similar && similar.length > 0 && (
            <div className="panel-section-divider">
              <div className="multi-source-header">多源报道 · {similar.length + 1} 家媒体</div>
              <div className="multi-source-current">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{article.source}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--blue)', textTransform: 'uppercase' }}>当前来源</span>
              </div>
              {similar.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                  className="panel-related-item">
                  <div className="panel-related-title">
                    {translated && a.titleZh ? a.titleZh : a.title}
                  </div>
                  <div className="panel-related-source">{a.source}</div>
                </a>
              ))}
            </div>
          )}

          {/* Related articles */}
          {related.length > 0 && (
            <div className="panel-section-divider">
              <div className="panel-section-label">相关文章</div>
              {related.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                  className="panel-related-item">
                  <div className="panel-related-title">
                    {translated && a.titleZh ? a.titleZh : a.title}
                  </div>
                  <div className="panel-related-source">{a.source}</div>
                </a>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
