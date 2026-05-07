'use client'

import { useState, useEffect, useRef } from 'react'
import { titleSimilarity, findRelated } from '@/lib/similarity'

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
}

interface Props {
  article: Article
  translated: boolean
  bookmarked: boolean
  onToggleBookmark: () => void
  onClose: () => void
  similar?: Article[]
}

export default function ArticlePanel({ article, translated, bookmarked, onToggleBookmark, onClose, similar }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ titleZh: string; contentZh: string } | null>(null)
  const [related, setRelated] = useState<Article[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    // 重置状态（切换文章时）
    setState('idle')
    setResult(null)
    setRelated([])

    // 拉同topic文章，用shared算法过滤出真正相关（非同一事件）的推荐
    fetch(`/api/articles?topic=${encodeURIComponent(article.topic)}&limit=30`)
      .then(r => r.json())
      .then(data => {
        const rows: Article[] = data.rows || data[article.topic] || []
        // 同一事件的文章已经在 similar 里了，这里只要"同topic但不同事件"的
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
      const data = await res.json()
      setResult(data)
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
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100,
      }} />

      <div ref={panelRef} className="slide-in" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)',
        background: 'var(--bg-card)',
        zIndex: 101,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        fontFamily: 'Georgia, serif',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, background: 'var(--tag-bg)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 4 }}>{article.topic}</span>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{article.source}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onToggleBookmark} style={{
              fontSize: 16, background: 'none', border: 'none', cursor: 'pointer',
              color: bookmarked ? '#D85A30' : 'var(--text-faint)', padding: '4px 8px',
            }}>
              {bookmarked ? '★' : '☆'}
            </button>
            <a href={article.url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: '#D85A30', textDecoration: 'none',
              padding: '4px 10px', border: '0.5px solid #D85A30', borderRadius: 6,
            }}>
              原文 ↗
            </a>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--text-faint)', lineHeight: 1, padding: 4,
            }}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.5rem 2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35, marginBottom: '1rem', color: 'var(--text-primary)' }}>
            {displayTitle}
          </h1>

          {article.imageUrl && (
            <img src={article.imageUrl} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}

          {article.summary && state !== 'done' && (
            <div style={{
              background: 'var(--ai-bg)', border: '0.5px solid var(--ai-border)', borderRadius: 8,
              padding: '12px 16px', marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--ai-text)', marginBottom: 6 }}>✦ AI 摘要</div>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', margin: 0 }}>{article.summary}</p>
            </div>
          )}

          {state === 'idle' && (
            <button onClick={handleTranslate} style={{
              width: '100%', padding: '12px', borderRadius: 8,
              background: '#D85A30', color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}>
              AI 翻译全文
            </button>
          )}

          {state === 'loading' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-faint)', fontSize: 14 }}>
              正在抓取并翻译全文...
            </div>
          )}

          {state === 'error' && (
            <div style={{ background: 'var(--error-bg)', border: '0.5px solid var(--error-border)', borderRadius: 8, padding: '12px 16px', color: 'var(--error-text)', fontSize: 13 }}>
              抓取失败，该网站可能限制了访问。<br />
              <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: '#D85A30' }}>点击前往原文 ↗</a>
            </div>
          )}

          {state === 'done' && result && (
            <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              {result.contentZh.split('\n').filter(Boolean).map((p, i) => (
                <p key={i} style={{ marginBottom: '1rem' }}>{p}</p>
              ))}
            </div>
          )}

          {/* 多源报道：同一事件，不同媒体 */}
          {similar && similar.length > 0 && (
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#185FA5', marginBottom: 12 }}>
                多源报道（{similar.length + 1} 家媒体）
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, padding: '8px 12px', background: 'rgba(24,95,165,0.06)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{article.source}</span>
                <span style={{ fontSize: 11, color: '#185FA5' }}>当前来源</span>
              </div>
              {similar.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderBottom: '0.5px solid var(--border-light)',
                  textDecoration: 'none', color: 'var(--text-primary)',
                  borderRadius: 4, gap: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
                    {translated && a.titleZh ? a.titleZh : a.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', paddingTop: 2 }}>{a.source}</div>
                </a>
              ))}
            </div>
          )}

          {/* 相关文章：同topic不同事件 */}
          {related.length > 0 && (
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>相关文章</div>
              {related.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', padding: '10px 0',
                  borderBottom: '0.5px solid var(--border-light)',
                  textDecoration: 'none', color: 'var(--text-primary)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>
                    {translated && a.titleZh ? a.titleZh : a.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.source}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
