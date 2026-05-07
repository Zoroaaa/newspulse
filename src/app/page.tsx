'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ArticlePanel from '@/components/ArticlePanel'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

type ViewStyle = 'magazine' | 'card' | 'list' | 'photo'

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

const PAGE_SIZE = 6

const TOPIC_COLORS: Record<string, string> = {
  '科技': '#185FA5',
  '商业': '#D85A30',
  '政治': '#639922',
  '文化': '#7B3FF2',
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: zhCN, addSuffix: true })
  } catch {
    return ''
  }
}

export default function HomePage() {
  const [articles, setArticles] = useState<Record<string, Article[]>>({})
  const [style, setStyle] = useState<ViewStyle>('magazine')
  const [translated, setTranslated] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [selected, setSelected] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTopic, setActiveTopic] = useState<string>('')
  const sectionRefs = useRef<Record<string, HTMLDivElement>>({})
  const hasMoreRef = useRef<Record<string, boolean>>({})
  const loadingMoreRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/articles')
      .then(r => r.json())
      .then(articleData => {
        setArticles(articleData)
        for (const t of Object.keys(articleData)) {
          hasMoreRef.current[t] = articleData[t].length >= PAGE_SIZE
        }
        const firstTopic = Object.keys(articleData)[0]
        if (firstTopic) setActiveTopic(firstTopic)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleTranslateAll = useCallback(async () => {
    if (translated || translating) return
    setTranslating(true)
    const toTranslate: { id: number; title: string }[] = []
    Object.values(articles).flat().forEach(a => {
      if (!a.titleZh) toTranslate.push({ id: a.id, title: a.title })
    })
    if (toTranslate.length === 0) { setTranslated(true); setTranslating(false); return }
    try {
      const res = await fetch('/api/articles/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: toTranslate }),
      })
      const map: Record<number, string> = await res.json()
      setArticles(prev => {
        const next = { ...prev }
        for (const topic in next) {
          next[topic] = next[topic].map(a => map[a.id] ? { ...a, titleZh: map[a.id] } : a)
        }
        return next
      })
      setTranslated(true)
    } catch {}
    setTranslating(false)
  }, [articles, translated, translating])

  const loadMore = async (topic: string) => {
    if (loadingMoreRef.current.has(topic)) return
    loadingMoreRef.current.add(topic)
    const offset = articles[topic]?.length || 0

    try {
      const res = await fetch(`/api/articles?topic=${encodeURIComponent(topic)}&offset=${offset}&limit=${PAGE_SIZE}`)
      const data = await res.json()
      if (data.rows?.length > 0) {
        setArticles(prev => ({
          ...prev,
          [topic]: [...(prev[topic] || []), ...data.rows],
        }))
      }
      hasMoreRef.current[topic] = data.hasMore ?? false
    } catch {}
    loadingMoreRef.current.delete(topic)
  }

  const scrollToTopic = (topicName: string) => {
    setActiveTopic(topicName)
    const el = sectionRefs.current[topicName]
    if (el) {
      const headerHeight = 52
      const navHeight = 48
      const y = el.getBoundingClientRect().top + window.scrollY - headerHeight - navHeight - 8
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  const topics = Object.keys(articles)
  const topArticle = topics.length > 0 ? articles[topics[0]]?.[0] : null

  return (
    <div className="min-h-screen" style={{ background: '#f5f3ee', fontFamily: 'Georgia, serif' }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e0ddd6',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
            News<span style={{ color: '#D85A30' }}>Pulse</span>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['magazine', 'card', 'list', 'photo'] as ViewStyle[]).map(s => (
              <button key={s} onClick={() => setStyle(s)} style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                border: style === s ? 'none' : '0.5px solid #ccc',
                background: style === s ? '#D85A30' : 'transparent',
                color: style === s ? '#fff' : '#666',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {{ magazine: '杂志', card: '卡片', list: '列表', photo: '图片' }[s]}
              </button>
            ))}

            <div style={{ width: 1, height: 16, background: '#e0ddd6', margin: '0 4px' }} />

            <button onClick={handleTranslateAll} disabled={translating || translated} style={{
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'Georgia, serif',
              border: '0.5px solid #ccc',
              background: translated ? '#e8f5e9' : 'transparent',
              color: translated ? '#2e7d32' : '#666',
              cursor: translating || translated ? 'default' : 'pointer',
            }}>
              {translating ? '翻译中...' : translated ? '✓ 已翻译' : '一键翻译标题'}
            </button>
          </div>
        </div>
      </header>

      {/* Topic Navigation Bar */}
      {!loading && topics.length > 0 && (
        <nav style={{
          background: '#fff',
          borderBottom: '1px solid #e0ddd6',
          position: 'sticky', top: 52, zIndex: 40,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem', display: 'flex', gap: 2, height: 48, alignItems: 'center' }}>
            {topics.map(t => {
              const count = articles[t]?.length || 0
              const color = TOPIC_COLORS[t] || '#D85A30'
              return (
                <button key={t} onClick={() => scrollToTopic(t)} style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontFamily: 'Georgia, serif',
                  border: 'none',
                  whiteSpace: 'nowrap',
                  background: activeTopic === t ? color : 'transparent',
                  color: activeTopic === t ? '#fff' : '#666',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: activeTopic === t ? 600 : 400,
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  if (activeTopic !== t) e.currentTarget.style.background = '#ede9e0'
                }}
                onMouseLeave={e => {
                  if (activeTopic !== t) e.currentTarget.style.background = 'transparent'
                }}
                >
                  {t}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: activeTopic === t ? 0.8 : 0.5 }}>{count}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999', fontSize: 14 }}>加载中...</div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无文章</p>
          <p style={{ fontSize: 13 }}>请前往 /admin 配置 AI 并触发抓取</p>
        </div>
      ) : (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>

          {/* Hero (magazine only) */}
          {style === 'magazine' && topArticle && (
            <div ref={el => { if (el) sectionRefs.current[topics[0]] = el as HTMLDivElement }} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem',
              marginBottom: '2rem', paddingBottom: '1.5rem',
              borderBottom: '1px solid #e0ddd6',
            }}>
              <div style={{ cursor: 'pointer' }} onClick={() => setSelected(topArticle)}>
                {topArticle.imageUrl && (
                  <img src={topArticle.imageUrl} alt="" style={{
                    width: '100%', height: 180, objectFit: 'cover',
                    borderRadius: 8, marginBottom: 12,
                  }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#D85A30', marginBottom: 6 }}>{topArticle.topic}</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 10, color: '#1a1a1a' }}>
                  {translated && topArticle.titleZh ? topArticle.titleZh : topArticle.title}
                </h2>
                {topArticle.summary && <p style={{ fontSize: 14, lineHeight: 1.65, color: '#555', marginBottom: 10 }}>{topArticle.summary}</p>}
                <div style={{ fontSize: 12, color: '#999', display: 'flex', gap: 10 }}>
                  <span style={{ fontWeight: 500, color: '#666' }}>{topArticle.source}</span>
                  <span>{timeAgo(topArticle.publishedAt || topArticle.createdAt)}</span>
                  <span style={{ color: '#0F6E56', background: '#E1F5EE', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>✦ AI摘要</span>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid #e0ddd6', paddingLeft: '1.5rem' }}>
                {(articles[topics[0]] ?? []).slice(1, 4).map((a, i) => (
                  <div key={a.id} onClick={() => setSelected(a)} style={{ cursor: 'pointer', paddingBottom: 14, marginBottom: 14, borderBottom: i < 2 ? '0.5px solid #eee' : 'none' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: '#185FA5', marginBottom: 4 }}>{a.topic}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: '#1a1a1a', marginBottom: 4 }}>
                      {translated && a.titleZh ? a.titleZh : a.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>{a.source} · {timeAgo(a.publishedAt || a.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Topic sections */}
          {topics.map((topic) => {
            const allArticles = articles[topic] || []
            const canLoadMore = hasMoreRef.current[topic]
            const isLoading = loadingMoreRef.current.has(topic)
            const color = TOPIC_COLORS[topic] || '#1a1a1a'

            return (
              <section
                key={topic}
                ref={el => { if (el) sectionRefs.current[topic] = el as HTMLDivElement }}
                style={{ marginBottom: '2rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>{topic}</span>
                  <span style={{ fontSize: 11, color: '#999', background: '#ede9e0', padding: '2px 8px', borderRadius: 10 }}>{allArticles.length} 篇</span>
                </div>

                {/* Magazine / Card */}
                {(style === 'magazine' || style === 'card') && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: style === 'card' ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12 }}>
                      {allArticles.map(a => (
                        <div key={a.id} onClick={() => setSelected(a)} className="fade-up" style={{
                          background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10,
                          padding: 14, cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = '#aaa')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0ddd6')}
                        >
                          <div style={{ fontSize: 11, color: '#999', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{a.source}</span><span>{timeAgo(a.publishedAt || a.createdAt)}</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: '#1a1a1a', marginBottom: 6 }}>
                            {translated && a.titleZh ? a.titleZh : a.title}
                          </div>
                          {a.summary && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{a.summary}</div>}
                          <div style={{ marginTop: 8, fontSize: 10, color: '#0F6E56', background: '#E1F5EE', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>✦ AI摘要</div>
                        </div>
                      ))}
                    </div>
                    {canLoadMore && (
                      <button onClick={() => loadMore(topic)} disabled={isLoading} style={{
                        width: '100%', marginTop: 12, padding: '8px',
                        background: '#fff',
                        border: '0.5px solid #e0ddd6',
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        color: color,
                        cursor: isLoading ? 'default' : 'pointer',
                        opacity: isLoading ? 0.6 : 1,
                      }}>
                        {isLoading ? '加载中...' : `↓ 查看更多`}
                      </button>
                    )}
                  </>
                )}

                {/* List */}
                {style === 'list' && (
                  <>
                    <div>
                      {allArticles.map((a, i) => (
                        <div key={a.id} onClick={() => setSelected(a)} style={{
                          display: 'flex', gap: 14, padding: '12px 0',
                          borderBottom: '0.5px solid #e0ddd6', cursor: 'pointer',
                          alignItems: 'flex-start',
                        }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: '#ddd', minWidth: 28, lineHeight: 1 }}>{i + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4, marginBottom: 4 }}>
                              {translated && a.titleZh ? a.titleZh : a.title}
                            </div>
                            <div style={{ fontSize: 12, color: '#999', display: 'flex', gap: 10 }}>
                              <span>{a.source}</span>
                              <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {canLoadMore && (
                      <button onClick={() => loadMore(topic)} disabled={isLoading} style={{
                        width: '100%', marginTop: 12, padding: '8px',
                        background: '#fff',
                        border: '0.5px solid #e0ddd6',
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        color: color,
                        cursor: isLoading ? 'default' : 'pointer',
                        opacity: isLoading ? 0.6 : 1,
                      }}>
                        {isLoading ? '加载中...' : `↓ 查看更多`}
                      </button>
                    )}
                  </>
                )}

                {/* Photo */}
                {style === 'photo' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                      {allArticles.map(a => (
                        <div key={a.id} onClick={() => setSelected(a)} style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', position: 'relative', aspectRatio: '16/10', background: '#e0ddd6' }}>
                          {a.imageUrl ? (
                            <img src={a.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: '#ede9e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 11, color: '#999' }}>{a.source}</span>
                            </div>
                          )}
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                            padding: '24px 10px 10px',
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                              {translated && a.titleZh ? a.titleZh : a.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{a.source}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {canLoadMore && (
                      <button onClick={() => loadMore(topic)} disabled={isLoading} style={{
                        width: '100%', marginTop: 12, padding: '8px',
                        background: '#fff',
                        border: '0.5px solid #e0ddd6',
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        color: color,
                        cursor: isLoading ? 'default' : 'pointer',
                        opacity: isLoading ? 0.6 : 1,
                      }}>
                        {isLoading ? '加载中...' : `↓ 查看更多`}
                      </button>
                    )}
                  </>
                )}
              </section>
            )
          })}
        </main>
      )}

      {/* Article side panel */}
      {selected && (
        <ArticlePanel article={selected} translated={translated} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
