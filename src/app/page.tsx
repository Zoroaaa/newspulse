'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ArticlePanel from '@/components/ArticlePanel'
import HeadlineCarousel from '@/components/HeadlineCarousel'
import { isSameEvent } from '@/lib/similarity'
import { proxyImage } from '@/lib/proxy'
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
  viewCount?: number
}

const PAGE_SIZE = 6

function generateTopicColor(topic: string): string {
  let hash = 0
  for (let i = 0; i < topic.length; i++) {
    hash = topic.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 60%, 38%)`
}

const topicColorCache: Record<string, string> = {}
function getTopicColor(topic: string): string {
  if (!topicColorCache[topic]) topicColorCache[topic] = generateTopicColor(topic)
  return topicColorCache[topic]
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: zhCN, addSuffix: true })
  } catch { return '' }
}

function estimateReadTime(text: string | null): string {
  if (!text) return ''
  const minutes = Math.max(1, Math.round(text.length / 400))
  return `${minutes} min`
}

// View style icons as text glyphs
const VIEW_ICONS: Record<ViewStyle, string> = {
  magazine: '⊞',
  card: '⊟',
  list: '☰',
  photo: '⊡',
}
const VIEW_LABELS: Record<ViewStyle, string> = {
  magazine: '杂志',
  card: '卡片',
  list: '列表',
  photo: '图片',
}

export default function HomePage() {
  const [articles, setArticles] = useState<Record<string, Article[]>>({})
  const [style, setStyle] = useState<ViewStyle>('magazine')
  const [translated, setTranslated] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [selected, setSelected] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTopic, setActiveTopic] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Article[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop' | 'large'>('desktop')
  const [mounted, setMounted] = useState(false)
  const [trendingArticles, setTrendingArticles] = useState<Article[]>([])
  const [siteStats, setSiteStats] = useState<{
    total: number; today: number; yesterday: number; week: number; trend: number
  } | null>(null)
  const [readIds, setReadIds] = useState<Set<number>>(new Set())
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [heroTopic, setHeroTopic] = useState<string>('')
  const [hasMoreState, setHasMoreState] = useState<Record<string, boolean>>({})

  const sectionRefs = useRef<Record<string, HTMLDivElement>>({})
  const hasMoreRef = useRef<Record<string, boolean>>({})
  const loadingMoreRef = useRef<Set<string>>(new Set())
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const articleIdsRef = useRef<number[]>([])

  const similarMap = useMemo(() => {
    const all = Object.values(articles).flat()
    const map: Record<number, Article[]> = {}
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (isSameEvent(all[i], all[j])) {
          if (!map[all[i].id]) map[all[i].id] = []
          if (!map[all[j].id]) map[all[j].id] = []
          map[all[i].id].push(all[j])
          map[all[j].id].push(all[i])
        }
      }
    }
    return map
  }, [articles])

  const containerStyle = {
    width: isMobile ? '100%' : '96%',
    maxWidth: screenSize === 'large' ? '1600px' : '1280px',
    margin: '0 auto',
    padding: isMobile ? '0 1rem' : '0 2rem',
  }

  const mainGridStyle = !isMobile && screenSize === 'large' ? {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2.4fr) minmax(0, 1fr)',
    gap: '2.5rem',
    alignItems: 'start',
  } : undefined

  useEffect(() => {
    fetch('/api/articles')
      .then(r => r.json())
      .then(articleData => {
        setArticles(articleData)
        const hasMore: Record<string, boolean> = {}
        for (const t of Object.keys(articleData)) {
          hasMore[t] = articleData[t].length >= PAGE_SIZE
          hasMoreRef.current[t] = hasMore[t]
        }
        setHasMoreState(hasMore)
        articleIdsRef.current = Object.values(articleData).flat().map((a: any) => a.id)
        const firstTopic = Object.keys(articleData)[0]
        if (firstTopic) setActiveTopic(firstTopic)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/trending?limit=5')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTrendingArticles(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('newspulse_bookmarks')
      if (saved) setBookmarks(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('newspulse_dark')
      if (saved === 'true') {
        setDarkMode(true)
        document.documentElement.classList.add('dark')
      }
    } catch {}
  }, [])

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth
      setIsMobile(width < 768)
      if (width < 768) setScreenSize('mobile')
      else if (width < 1024) setScreenSize('tablet')
      else if (width < 1440) setScreenSize('desktop')
      else setScreenSize('large')
      setMounted(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('newspulse_read')
      if (saved) setReadIds(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/config/public')
      .then(r => r.json())
      .then(data => { if (data.hero_topic) setHeroTopic(data.hero_topic) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/site-stats')
        if (res.ok) setSiteStats(await res.json())
      } catch {}
    }
    fetchStats()
    const interval = setInterval(fetchStats, 20000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/site-stats/visit', { method: 'POST' }).catch(() => {})
  }, [])

  const markRead = useCallback((id: number) => {
    setReadIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('newspulse_read', JSON.stringify([...next])) } catch {}
      return next
    })
    fetch('/api/articles/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }, [])

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      try { localStorage.setItem('newspulse_dark', String(next)) } catch {}
      if (next) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      return next
    })
  }, [])

  const toggleBookmark = useCallback((id: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('newspulse_bookmarks', JSON.stringify([...next])) } catch {}
      return next
    })
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

  const handleSearchInput = useCallback((q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults([]); setSearching(false)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      return
    }
    setSearching(true); setShowSearch(true)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSearchResults(data.rows || [])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 300)
  }, [])

  const openSearch = useCallback(() => {
    setShowSearch(true); setShowBookmarks(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setShowSearch(false); setSearchQuery(''); setSearchResults([])
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 's' || e.key === '/') { e.preventDefault(); openSearch(); return }
      if (e.key === 'b') { e.preventDefault(); setShowBookmarks(v => !v); setShowSearch(false); return }
      if (e.key === 't') { e.preventDefault(); handleTranslateAll(); return }
      if (e.key === 'Escape') {
        if (showSearch) { closeSearch(); return }
        if (showBookmarks) { setShowBookmarks(false); return }
        if (selected) { setSelected(null); return }
        setFocusedId(null); return
      }
      if (selected) return
      if (e.key === 'j') {
        e.preventDefault()
        const ids = articleIdsRef.current
        const curIdx = focusedId ? ids.indexOf(focusedId) : -1
        const nextId = ids[Math.min(curIdx + 1, ids.length - 1)]
        setFocusedId(nextId)
        cardRefs.current.get(nextId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (e.key === 'k') {
        e.preventDefault()
        const ids = articleIdsRef.current
        const curIdx = focusedId ? ids.indexOf(focusedId) : ids.length
        const nextId = ids[Math.max(curIdx - 1, 0)]
        setFocusedId(nextId)
        cardRefs.current.get(nextId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (e.key === 'Enter' && focusedId) {
        e.preventDefault()
        setArticles(prev => {
          const a = Object.values(prev).flat().find(x => x.id === focusedId)
          if (a) { setSelected(a); markRead(a.id) }
          return prev
        })
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedId, showSearch, showBookmarks, selected, handleTranslateAll, markRead, openSearch, closeSearch])

  const loadMore = async (topic: string) => {
    if (loadingMoreRef.current.has(topic)) return
    loadingMoreRef.current.add(topic)
    const offset = articles[topic]?.length || 0
    try {
      const res = await fetch(`/api/articles?topic=${encodeURIComponent(topic)}&offset=${offset}&limit=${PAGE_SIZE}`)
      const data = await res.json()
      if (data.rows?.length > 0) {
        setArticles(prev => {
          const next = { ...prev, [topic]: [...(prev[topic] || []), ...data.rows] }
          articleIdsRef.current = Object.values(next).flat().map(a => a.id)
          return next
        })
      }
      const hasMore = data.hasMore ?? false
      hasMoreRef.current[topic] = hasMore
      setHasMoreState(prev => ({ ...prev, [topic]: hasMore }))
    } catch {}
    loadingMoreRef.current.delete(topic)
  }

  const scrollToTopic = (topicName: string) => {
    setActiveTopic(topicName); setShowSearch(false); setShowBookmarks(false)
    const el = sectionRefs.current[topicName]
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 60 - 44 - 12
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  const setCardRef = useCallback((id: number) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  // Grid columns per view and screen
  const gridCols = isMobile ? '1fr' : `repeat(auto-fill, minmax(${screenSize === 'large' ? '290px' : '265px'}, 1fr))`
  const photoCols = isMobile ? '1fr' : `repeat(auto-fill, minmax(${screenSize === 'large' ? '240px' : '210px'}, 1fr))`
  const trendingCols = isMobile ? '1fr' : screenSize === 'tablet' ? 'repeat(3,1fr)' : `repeat(auto-fill, minmax(190px, 1fr))`

  const topics = Object.keys(articles)
  const heroTopicKey = (heroTopic && topics.includes(heroTopic)) ? heroTopic : topics[0] || ''
  const topArticle = heroTopicKey ? articles[heroTopicKey]?.[0] : null

  const renderCard = (a: Article, idx?: number) => {
    const title = translated && a.titleZh ? a.titleZh : a.title
    const isBookmarked = bookmarks.has(a.id)
    const isRead = readIds.has(a.id)
    const isFocused = focusedId === a.id
    const similar = similarMap[a.id]
    const handleClick = () => { setSelected(a); markRead(a.id) }

    if (style === 'list') {
      return (
        <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick}
          className={`list-item ${isFocused ? 'focused' : ''}`}
          style={{ outline: 'none', boxShadow: isFocused ? '0 0 0 2px var(--accent)' : 'none' }}
        >
          <span className="list-num">{(idx ?? 0) + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`card-title ${isRead ? 'read' : ''}`} style={{ fontSize: 14, marginBottom: 5 }}>{title}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="card-source">{a.source}</span>
              {similar && <span className="multi-source-badge">+{similar.length} 来源</span>}
              <span className="card-time">{timeAgo(a.publishedAt || a.createdAt)}</span>
              {a.summary && <span className="ai-tag">✦</span>}
            </div>
          </div>
          <button onClick={e => toggleBookmark(a.id, e)} className={`bookmark-btn ${isBookmarked ? 'active' : ''}`}
            style={{ position: 'static', alignSelf: 'flex-start', marginTop: 2 }}>
            {isBookmarked ? '★' : '☆'}
          </button>
        </div>
      )
    }

    if (style === 'photo') {
      return (
        <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick}
          className={`photo-card ${isFocused ? 'focused' : ''}`}
          style={{ outline: 'none', boxShadow: isFocused ? '0 0 0 2px var(--accent)' : 'none' }}
        >
          {a.imageUrl ? (
            <img src={proxyImage(a.imageUrl)!} alt="" style={{
              width: '100%', height: '100%', objectFit: 'cover', opacity: isRead ? 0.65 : 1,
            }} onError={(e) => {
              const img = e.target as HTMLImageElement
              if (img.src !== a.imageUrl) img.src = a.imageUrl!
              else img.style.display = 'none'
            }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', background: 'var(--bg-hover)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="card-source" style={{ fontSize: 12 }}>{a.source}</span>
            </div>
          )}
          <div className="photo-overlay">
            <div className="photo-title" style={{ opacity: isRead ? 0.65 : 1 }}>{title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>{a.source}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{timeAgo(a.publishedAt || a.createdAt)}</span>
            </div>
          </div>
        </div>
      )
    }

    // card / magazine
    return (
      <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick}
        className={`card fade-up ${isRead ? 'read' : ''} ${isFocused ? 'focused' : ''}`}
        style={{ padding: 16 }}
      >
        <button onClick={e => toggleBookmark(a.id, e)} className={`bookmark-btn ${isBookmarked ? 'active' : ''}`}>
          {isBookmarked ? '★' : '☆'}
        </button>

        {/* Image (only show if available, card style) */}
        {a.imageUrl && (
          <div style={{ marginBottom: 12, borderRadius: 6, overflow: 'hidden', maxHeight: 140 }}>
            <img src={proxyImage(a.imageUrl)!} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                const img = e.target as HTMLImageElement
                if (img.src !== a.imageUrl) img.src = a.imageUrl!
                else (img.parentElement as HTMLElement).style.display = 'none'
              }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="card-source">{a.source}</span>
            {similar && <span className="multi-source-badge">+{similar.length} 来源</span>}
          </div>
          <span className="card-time">{timeAgo(a.publishedAt || a.createdAt)}</span>
        </div>

        <div className={`card-title ${isRead ? 'read' : ''}`} style={{ marginBottom: 8, paddingRight: 20 }}>{title}</div>

        {a.summary && (
          <div className="card-summary" style={{ marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.summary}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          {a.summary && <span className="ai-tag">✦ AI 摘要</span>}
          {a.summary && <span className="card-time">{estimateReadTime(a.summary)}</span>}
        </div>
      </div>
    )
  }

  const renderLoadMore = (topic: string) => {
    const canLoadMore = hasMoreState[topic]
    const isLoading = loadingMoreRef.current.has(topic)
    if (!canLoadMore) return null
    return (
      <button onClick={() => loadMore(topic)} disabled={isLoading} className="load-more-btn">
        {isLoading ? '加载中...' : '↓ 更多文章'}
      </button>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>

      {/* ===== HEADER ===== */}
      <header className="site-header">
        <div style={{ ...containerStyle, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="site-logo">
              News<span className="site-logo-accent">Pulse</span>
            </span>
            {siteStats && !isMobile && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)',
                letterSpacing: '0.04em', borderLeft: '1px solid var(--border)', paddingLeft: 14,
              }}>
                {siteStats.total.toLocaleString()} 篇文章
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>

            {/* Dark mode */}
            <button className="icon-btn" onClick={toggleDarkMode} title="切换主题">
              {darkMode ? '○' : '●'}
            </button>

            {/* Search (desktop) */}
            {!isMobile && (
              <div className="search-box" style={{
                width: showSearch ? 210 : 34,
                border: showSearch ? '0.5px solid var(--border-strong)' : 'none',
                background: showSearch ? 'var(--bg-muted)' : 'transparent',
              }}>
                <button
                  onClick={() => showSearch && !searchQuery ? closeSearch() : openSearch()}
                  className="icon-btn"
                  style={{ flexShrink: 0, color: showSearch ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  ⌕
                </button>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索文章..."
                  value={searchQuery}
                  onChange={e => handleSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
                  className="search-input"
                  style={{
                    flex: 1, opacity: showSearch ? 1 : 0,
                    pointerEvents: showSearch ? 'auto' : 'none',
                    width: showSearch ? 'auto' : 0,
                  }}
                />
                {showSearch && searchQuery && (
                  <button onClick={closeSearch} className="icon-btn" style={{ flexShrink: 0, fontSize: 12 }}>✕</button>
                )}
              </div>
            )}

            {/* View style toggles */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 4 }}>
              {(['magazine', 'card', 'list', 'photo'] as ViewStyle[]).map(s => (
                <button key={s} onClick={() => setStyle(s)}
                  className={`view-btn ${style === s ? 'active' : ''}`}
                  title={VIEW_LABELS[s]}
                >
                  {isMobile ? VIEW_ICONS[s] : VIEW_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Search (mobile) */}
            {isMobile && (
              <button className={`icon-btn ${showSearch ? 'active' : ''}`}
                onClick={showSearch ? closeSearch : openSearch}>
                ⌕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== TOPIC NAV ===== */}
      {!loading && topics.length > 0 && (
        <nav className="topic-nav">
          <div style={{ ...containerStyle, height: '100%', display: 'flex', gap: 4, alignItems: 'center' }}>
            {topics.map(t => {
              const count = articles[t]?.length || 0
              const color = getTopicColor(t)
              const isActive = activeTopic === t
              return (
                <button key={t}
                  className={`topic-pill ${isActive ? 'active' : ''}`}
                  style={{ background: isActive ? color : undefined }}
                  onClick={() => scrollToTopic(t)}
                >
                  {t}
                  <span style={{ marginLeft: 5, fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.65 }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* ===== MOBILE SEARCH ===== */}
      {isMobile && showSearch && (
        <div className="mobile-search">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索文章..."
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            autoFocus
          />
          <button onClick={closeSearch} className="icon-btn" style={{ fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ===== MAIN ===== */}
      {loading ? (
        <div style={{ ...containerStyle, padding: isMobile ? '1.5rem 1rem' : '2rem 2rem' }}>
          <div className="loading-state">
            <span style={{ letterSpacing: '0.06em' }}>加载中</span>
            <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>···</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton" style={{ height: 160, borderRadius: 10 }} />
            ))}
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-faint)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 8 }}>暂无文章</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em' }}>请前往 /admin 配置 AI 并触发抓取</div>
        </div>
      ) : (
        <main style={{ ...containerStyle, padding: isMobile ? '1.25rem 1rem' : '2rem 2rem' }}>
          <div style={mainGridStyle || {}}>

            {/* ===== LEFT: MAIN CONTENT ===== */}
            <div className="content-area">

              {/* Search results */}
              {showSearch && searchQuery && (
                <section style={{ marginBottom: '2.5rem' }}>
                  <div className="section-header">
                    <span className="section-title">搜索结果</span>
                    <span className="section-count">{searching ? '…' : searchResults.length}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-faint)' }}>「{searchQuery}」</span>
                  </div>
                  {searching ? (
                    <div className="loading-state">搜索中...</div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      未找到相关文章
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                      {searchResults.map(a => renderCard(a))}
                    </div>
                  )}
                </section>
              )}

              {/* Bookmarks */}
              {showBookmarks && (
                <section style={{ marginBottom: '2.5rem' }}>
                  <div className="section-header">
                    <span className="section-title">收藏夹</span>
                    <span className="section-count">{bookmarks.size}</span>
                  </div>
                  {bookmarks.size === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-faint)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 6 }}>暂无收藏</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em' }}>点击卡片右上角 ☆ 即可收藏</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                      {Object.values(articles).flat().filter(a => bookmarks.has(a.id)).map(a => renderCard(a))}
                    </div>
                  )}
                </section>
              )}

              {/* Trending strip */}
              {trendingArticles.length > 0 && !showSearch && !showBookmarks && (
                <section style={{ marginBottom: '2.5rem' }}>
                  <div className="section-header">
                    <span className="section-title accent" style={{ color: 'var(--accent)' }}>热门</span>
                    <span className="section-count">实时</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: trendingCols, gap: 12 }}>
                    {trendingArticles.map((a, i) => (
                      <div key={a.id} className="trending-card" onClick={() => { setSelected(a); markRead(a.id) }}>
                        <div className={`trending-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</div>
                        <div style={{ paddingLeft: 32 }}>
                          <div className="card-title" style={{ fontSize: 13, marginBottom: 6 }}>
                            {(translated && a.titleZh ? a.titleZh : a.title)}
                          </div>
                          <div className="card-source">{a.source}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Hero - magazine only, desktop */}
              {style === 'magazine' && topArticle && !isMobile && !showSearch && !showBookmarks && (
                <section ref={el => { if (el) sectionRefs.current[heroTopicKey] = el as HTMLDivElement }}
                  style={{ marginBottom: '2.5rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* Left: featured */}
                    <div style={{ cursor: 'pointer' }} onClick={() => { setSelected(topArticle); markRead(topArticle.id) }}>
                      {topArticle.imageUrl && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                          <img src={proxyImage(topArticle.imageUrl)!} alt="" className="hero-img"
                            style={{ height: 200 }}
                            onError={(e) => {
                              const img = e.target as HTMLImageElement
                              if (img.src !== topArticle.imageUrl) img.src = topArticle.imageUrl!
                              else (img.parentElement as HTMLElement).style.display = 'none'
                            }} />
                        </div>
                      )}
                      <div className="hero-topic-label">{topArticle.topic}</div>
                      <h2 className="hero-title">{translated && topArticle.titleZh ? topArticle.titleZh : topArticle.title}</h2>
                      {topArticle.summary && <p className="hero-summary">{topArticle.summary}</p>}
                      <div className="hero-meta">
                        <span className="hero-source">{topArticle.source}</span>
                        <span>{timeAgo(topArticle.publishedAt || topArticle.createdAt)}</span>
                        <span className="ai-tag">✦ AI 摘要</span>
                      </div>
                    </div>

                    {/* Right: sidebar articles */}
                    <div className="hero-divider">
                      {(articles[heroTopicKey] ?? []).slice(1, 5).map((a, i) => (
                        <div key={a.id} onClick={() => { setSelected(a); markRead(a.id) }}
                          style={{
                            cursor: 'pointer', paddingBottom: 16, marginBottom: 16,
                            borderBottom: i < 3 ? '0.5px solid var(--border-light)' : 'none',
                            transition: 'padding-left 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.paddingLeft = '6px')}
                          onMouseLeave={e => (e.currentTarget.style.paddingLeft = '0')}
                        >
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>{a.topic}</div>
                          <div className="card-title" style={{ fontSize: 14, marginBottom: 6 }}>
                            {translated && a.titleZh ? a.titleZh : a.title}
                          </div>
                          <div className="hero-meta">
                            <span className="hero-source">{a.source}</span>
                            <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Headline carousel - desktop only */}
              {!isMobile && trendingArticles.length > 0 && !showSearch && !showBookmarks && (
                <HeadlineCarousel
                  articles={trendingArticles.slice(0, 9)}
                  translated={translated}
                  onSelect={(article) => { setSelected(article); markRead(article.id) }}
                />
              )}

              {/* Topic sections */}
              {topics.map((topic) => {
                const allArticles = articles[topic] || []
                const color = getTopicColor(topic)

                return (
                  <section
                    key={topic}
                    ref={el => { if (el) sectionRefs.current[topic] = el as HTMLDivElement }}
                    style={{ marginBottom: '2.5rem' }}
                  >
                    <div className="section-header" style={{ borderBottomColor: color }}>
                      <span className="section-title">{topic}</span>
                      <span className="section-count">{allArticles.length}</span>
                    </div>

                    {(style === 'magazine' || style === 'card') && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                          {allArticles.map(a => renderCard(a))}
                        </div>
                        {renderLoadMore(topic)}
                      </>
                    )}

                    {style === 'list' && (
                      <>
                        <div>{allArticles.map((a, i) => renderCard(a, i))}</div>
                        {renderLoadMore(topic)}
                      </>
                    )}

                    {style === 'photo' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: photoCols, gap: 12 }}>
                          {allArticles.map(a => renderCard(a))}
                        </div>
                        {renderLoadMore(topic)}
                      </>
                    )}
                  </section>
                )
              })}
            </div>

            {/* ===== RIGHT: SIDEBAR (large screens only) ===== */}
            {!isMobile && screenSize === 'large' && (
              <aside className="smart-sidebar" style={{ position: 'sticky', top: 118, height: 'fit-content' }}>

                {/* Today's hot */}
                <div className="sidebar-widget">
                  <div className="widget-title">今日热读</div>
                  {trendingArticles.slice(0, 5).map((article, i) => (
                    <div key={i} className="rank-item"
                      onClick={() => { setSelected(article); markRead(article.id) }}
                    >
                      <span className={`rank-num ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rank-title">
                          {(translated && article.titleZh ? article.titleZh : article.title).slice(0, 46)}
                          {(translated && article.titleZh ? article.titleZh : article.title).length > 46 ? '…' : ''}
                        </div>
                        <div className="rank-source">{article.source}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Topic cloud */}
                <div className="sidebar-widget">
                  <div className="widget-title">话题浏览</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {topics.slice(0, 12).map((topic) => (
                      <button key={topic} onClick={() => scrollToTopic(topic)}
                        className={`topic-tag ${activeTopic === topic ? 'active' : ''}`}
                        style={{ background: activeTopic === topic ? getTopicColor(topic) : undefined }}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="sidebar-widget">
                  <div className="widget-title">快捷操作</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={handleTranslateAll} disabled={translating || translated}
                      className={`quick-btn ${translated ? 'done' : ''}`}>
                      {translating ? '⟳ 翻译中...' : translated ? '✓ 已全部翻译' : '⟡ 翻译全部标题'}
                    </button>
                    <button onClick={() => { setShowBookmarks(!showBookmarks); setShowSearch(false) }}
                      className="quick-btn"
                      style={{ background: showBookmarks ? 'var(--bg-hover)' : undefined }}>
                      ☆ 我的收藏 ({bookmarks.size})
                    </button>
                    <button onClick={openSearch} className="quick-btn">
                      ⌕ 搜索文章
                    </button>
                  </div>
                </div>

                {/* Site stats */}
                {siteStats && (
                  <div className="sidebar-widget">
                    <div className="widget-title">站点数据</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      <div className="stat-cell">
                        <div className="stat-label">今日</div>
                        <div className="stat-value accent">{siteStats.today}</div>
                      </div>
                      <div className="stat-cell">
                        <div className="stat-label">昨日</div>
                        <div className="stat-value">{siteStats.yesterday}</div>
                      </div>
                      <div className="stat-cell">
                        <div className="stat-label">本周</div>
                        <div className="stat-value">{siteStats.week}</div>
                      </div>
                      <div className="stat-cell">
                        <div className="stat-label">累计</div>
                        <div className="stat-value">{siteStats.total.toLocaleString()}</div>
                      </div>
                      <div className="stat-cell" style={{ gridColumn: 'span 2' }}>
                        <div className="stat-label">较昨日</div>
                        <div className="stat-value" style={{
                          fontSize: 14,
                          color: siteStats.trend > 0 ? 'var(--success-text)' : siteStats.trend < 0 ? 'var(--error-text)' : 'var(--text-faint)'
                        }}>
                          {siteStats.trend > 0 ? '+' : ''}{siteStats.trend.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Keyboard shortcuts hint */}
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>键盘快捷键</div>
                      {[['/', '搜索'], ['j k', '上下导航'], ['t', '翻译'], ['b', '收藏夹'], ['Esc', '关闭']].map(([key, label]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>{key}</code>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </aside>
            )}

          </div>
        </main>
      )}

      {/* ===== ARTICLE PANEL ===== */}
      {selected && (
        <ArticlePanel
          article={selected}
          translated={translated}
          bookmarked={bookmarks.has(selected.id)}
          onToggleBookmark={() => toggleBookmark(selected.id)}
          onClose={() => setSelected(null)}
          similar={similarMap[selected.id]}
        />
      )}
    </div>
  )
}
