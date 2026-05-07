'use client'

import { useState, useEffect } from 'react'

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
  onClose: () => void
}

export default function ArticlePanel({ article, translated, onClose }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ titleZh: string; contentZh: string } | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

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

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100,
      }} />

      {/* Panel */}
      <div className="slide-in" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)',
        background: '#fff',
        zIndex: 101,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        fontFamily: 'Georgia, serif',
      }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, background: '#ede9e0', color: '#666', padding: '2px 8px', borderRadius: 4 }}>{article.topic}</span>
            <span style={{ fontSize: 12, color: '#999' }}>{article.source}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={article.url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: '#D85A30', textDecoration: 'none',
              padding: '4px 10px', border: '0.5px solid #D85A30', borderRadius: 6,
            }}>
              原文 ↗
            </a>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#999', lineHeight: 1, padding: 4,
            }}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.5rem 2rem' }}>
          {/* Title */}
          <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35, marginBottom: '1rem', color: '#1a1a1a' }}>
            {state === 'done' && result ? result.titleZh : (translated && article.titleZh ? article.titleZh : article.title)}
          </h1>

          {/* Image */}
          {article.imageUrl && (
            <img src={article.imageUrl} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}

          {/* AI Summary */}
          {article.summary && state !== 'done' && (
            <div style={{
              background: '#f0faf5', border: '0.5px solid #b2dfdb', borderRadius: 8,
              padding: '12px 16px', marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: '#0F6E56', marginBottom: 6 }}>✦ AI 摘要</div>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: '#333', margin: 0 }}>{article.summary}</p>
            </div>
          )}

          {/* Translate button */}
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
            <div style={{ textAlign: 'center', padding: '2rem', color: '#999', fontSize: 14 }}>
              正在抓取并翻译全文...
            </div>
          )}

          {state === 'error' && (
            <div style={{ background: '#fff5f5', border: '0.5px solid #ffcdd2', borderRadius: 8, padding: '12px 16px', color: '#c62828', fontSize: 13 }}>
              抓取失败，该网站可能限制了访问。<br />
              <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: '#D85A30' }}>点击前往原文 ↗</a>
            </div>
          )}

          {state === 'done' && result && (
            <div style={{ fontSize: 15, lineHeight: 1.8, color: '#2a2a2a' }}>
              {result.contentZh.split('\n').filter(Boolean).map((p, i) => (
                <p key={i} style={{ marginBottom: '1rem' }}>{p}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
