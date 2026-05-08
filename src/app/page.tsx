'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ArticlePanel from '@/components/ArticlePanel'
import HeadlineCarousel from '@/components/HeadlineCarousel'
import { isSameEvent } from '@/lib/similarity'
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

function generateTopicColor(topic: string): string {
  let hash = 0
  for (let i = 0; i < topic.length; i++) {
    hash = topic.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  const hue = Math.abs(hash % 360)
  const saturation = 65 + (Math.abs(hash >> 8) % 20)
  const lightness = 45 + (Math.abs(hash >> 16) % 10)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const topicColorCache: Record<string, string> = {}
function getTopicColor(topic: string): string {
  if (!topicColorCache[topic]) {
    topicColorCache[topic] = generateTopicColor(topic)
  }
  return topicColorCache[topic]
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: zhCN, addSuffix: true })
  } catch {
    return ''
  }
}

function estimateReadTime(text: string | null): string {
  if (!text) return ''
  const len = text.length
  const minutes = Math.max(1, Math.round(len / 400))
  return `约 ${minutes} 分钟`
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

  // 响应式容器配置 - 核心改进
  const containerStyle = {
    width: isMobile ? '100%' : screenSize === 'tablet' ? '98%' : screenSize === 'desktop' ? '96%' : '95%',
    margin: '0 auto',
    padding: isMobile ? '0 1rem' : screenSize === 'tablet' ? '0 1.5rem' : '0 2rem',
  }

  // 双栏布局配置（仅大屏）
  const mainGridStyle = !isMobile && screenSize === 'large' ? {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2.5fr) minmax(0, 1fr)',
    gap: '2rem',
    alignItems: 'start',
  } : undefined
  const [readIds, setReadIds] = useState<Set<number>>(new Set())
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [heroTopic, setHeroTopic] = useState<string>('')
  const sectionRefs = useRef<Record<string, HTMLDivElement>>({})
  const hasMoreRef = useRef<Record<string, boolean>>({})
  // 用 state 驱动 loadMore 按钮的显隐（ref 不触发重渲染）
  const [hasMoreState, setHasMoreState] = useState<Record<string, boolean>>({})
  const loadingMoreRef = useRef<Set<string>>(new Set())
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // 抽出 articleIds ref，供 keydown handler 读取，避免 articles 进入依赖数组
  const articleIdsRef = useRef<number[]>([])

  // 多源报道映射：单向遍历，每对只比较一次（O(n²/2) → 同渐进但常数减半，且避免重复赋值）
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

  const markRead = useCallback((id: number) => {
    setReadIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('newspulse_read', JSON.stringify([...next])) } catch {}
      return next
    })
    // 上报阅读事件（fire-and-forget，不阻塞 UI）
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

  // 搜索防抖
  const handleSearchInput = useCallback((q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults([])
      setSearching(false)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      return
    }
    setSearching(true)
    setShowSearch(true)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSearchResults(data.rows || [])
      } catch {
        setSearchResults([])
      }
      setSearching(false)
    }, 300)
  }, [])

  const openSearch = useCallback(() => {
    setShowSearch(true)
    setShowBookmarks(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  }, [])

  // 键盘快捷键 - 面板打开时禁用文章导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 's' || e.key === '/') {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key === 'b') {
        e.preventDefault()
        setShowBookmarks(v => !v)
        setShowSearch(false)
        return
      }
      if (e.key === 't') {
        e.preventDefault()
        handleTranslateAll()
        return
      }
      if (e.key === 'Escape') {
        if (showSearch) { closeSearch(); return }
        if (showBookmarks) { setShowBookmarks(false); return }
        if (selected) { setSelected(null); return }
        setFocusedId(null)
        return
      }
      // 面板打开时，j/k/Enter 不响应
      if (selected) return

      if (e.key === 'j') {
        e.preventDefault()
        const ids = articleIdsRef.current
        const curIdx = focusedId ? ids.indexOf(focusedId) : -1
        const nextIdx = Math.min(curIdx + 1, ids.length - 1)
        const nextId = ids[nextIdx]
        setFocusedId(nextId)
        const el = cardRefs.current.get(nextId)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus()
        return
      }
      if (e.key === 'k') {
        e.preventDefault()
        const ids = articleIdsRef.current
        const curIdx = focusedId ? ids.indexOf(focusedId) : ids.length
        const nextIdx = Math.max(curIdx - 1, 0)
        const nextId = ids[nextIdx]
        setFocusedId(nextId)
        const el = cardRefs.current.get(nextId)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus()
        return
      }
      if (e.key === 'Enter' && focusedId) {
        e.preventDefault()
        // 从 articles state 读取当前文章（仍需闭包，但只在 Enter 时触发，可接受）
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
          const next = {
            ...prev,
            [topic]: [...(prev[topic] || []), ...data.rows],
          }
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
    setActiveTopic(topicName)
    setShowSearch(false)
    setShowBookmarks(false)
    const el = sectionRefs.current[topicName]
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 52 - 48 - 8
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  const gridCols = isMobile ? 'repeat(1,1fr)' : `repeat(auto-fill, minmax(${screenSize === 'large' ? '300px' : '280px'}, 1fr))`
  const photoCols = isMobile ? 'repeat(1,1fr)' : `repeat(auto-fill, minmax(${screenSize === 'large' ? '250px' : '220px'}, 1fr))`
  const trendingCols = isMobile ? 'repeat(1,1fr)' : screenSize === 'tablet' ? 'repeat(3,1fr)' : `repeat(auto-fill, minmax(${screenSize === 'large' ? '200px' : '180px'}, 1fr))`
  const topics = Object.keys(articles)
  const heroTopicKey = (heroTopic && topics.includes(heroTopic)) ? heroTopic : topics[0] || ''
  const topArticle = heroTopicKey ? articles[heroTopicKey]?.[0] : null

  const setCardRef = useCallback((id: number) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const renderCard = (a: Article, idx?: number) => {
    const title = translated && a.titleZh ? a.titleZh : a.title
    const isBookmarked = bookmarks.has(a.id)
    const isRead = readIds.has(a.id)
    const isFocused = focusedId === a.id
    const focusRing = isFocused ? '0 0 0 2px #D85A30' : 'none'
    const titleColor = isRead ? 'var(--text-faint)' : 'var(--text-primary)'
    const similar = similarMap[a.id]

    const handleClick = () => { setSelected(a); markRead(a.id) }

    if (style === 'list') {
      return (
        <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick} style={{
          display: 'flex', gap: 14, padding: '12px 0',
          borderBottom: '0.5px solid var(--border)', cursor: 'pointer',
          alignItems: 'flex-start', outline: 'none', boxShadow: focusRing, borderRadius: 4,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--border)', minWidth: 28, lineHeight: 1 }}>{(idx ?? 0) + 1}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: titleColor, lineHeight: 1.4, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{a.source}</span>
              {similar && <span style={{ fontSize: 10, color: '#185FA5', background: 'rgba(24,95,165,0.08)', padding: '1px 6px', borderRadius: 4 }}>+{similar.length} 来源</span>}
              <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
              {a.summary && <span style={{ color: 'var(--ai-text)', background: 'var(--ai-tag-bg)', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>✦</span>}
            </div>
          </div>
          <button onClick={e => toggleBookmark(a.id, e)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, color: isBookmarked ? '#D85A30' : 'var(--border)',
            padding: '4px 2px',
          }}>★</button>
        </div>
      )
    }

    if (style === 'photo') {
      return (
        <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick} style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', position: 'relative', aspectRatio: '16/10', background: 'var(--border)', outline: 'none', boxShadow: focusRing }}>
          {a.imageUrl ? (
            <img src={a.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isRead ? 0.7 : 1 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.source}</span>
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            padding: '24px 10px 10px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3, opacity: isRead ? 0.7 : 1 }}>{title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{a.source}</span>
              <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
            </div>
          </div>
        </div>
      )
    }

    // card / magazine
    return (
      <div key={a.id} ref={setCardRef(a.id)} tabIndex={-1} onClick={handleClick} className="fade-up" style={{
        background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 10,
        padding: 14, cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative',
        outline: 'none', boxShadow: focusRing,
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-faint)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <button onClick={e => toggleBookmark(a.id, e)} style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: isBookmarked ? '#D85A30' : 'var(--border)',
          padding: 2, transition: 'color 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#D85A30')}
          onMouseLeave={e => (e.currentTarget.style.color = isBookmarked ? '#D85A30' : 'var(--border)')}
        >★</button>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>{a.source}</span>
            {similar && <span style={{ fontSize: 10, color: '#185FA5', background: 'rgba(24,95,165,0.08)', padding: '1px 6px', borderRadius: 4 }}>+{similar.length} 来源</span>}
          </span>
          <span>{timeAgo(a.publishedAt || a.createdAt)}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: titleColor, marginBottom: 6, paddingRight: 20 }}>{title}</div>
        {a.summary && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 4 }}>{a.summary}</div>}
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--ai-text)', background: 'var(--ai-tag-bg)', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>✦ AI摘要</span>
          {a.summary && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{estimateReadTime(a.summary)}</span>}
        </div>
      </div>
    )
  }

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  const loadMoreBtn = (topic: string, canLoadMore: boolean, isLoading: boolean, color: string) => {
    if (!canLoadMore) return null
    return (
      <button onClick={() => loadMore(topic)} disabled={isLoading} style={{
        width: '100%', marginTop: 12, padding: '8px 12px',
        background: hexToRgba(color, 0.06),
        border: `1px solid ${hexToRgba(color, 0.25)}`,
        borderRadius: 8,
        fontSize: 13,
        fontFamily: 'Georgia, serif',
        color: color,
        cursor: isLoading ? 'default' : 'pointer',
        opacity: isLoading ? 0.6 : 1,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {isLoading ? '加载中...' : '↓ 查看更多'}
      </button>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)', fontFamily: 'Georgia, serif' }}>
      <header style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ ...containerStyle, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
            News<span style={{ color: '#D85A30' }}>Pulse</span>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={toggleDarkMode} style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 14,
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--text-muted)',
            }}>
              {darkMode ? '☀️' : '🌙'}
            </button>

            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  width: showSearch ? 200 : 32,
                  transition: 'width 0.25s ease',
                  overflow: 'hidden',
                  border: showSearch ? '0.5px solid var(--border)' : 'none',
                  borderRadius: 6,
                  background: showSearch ? 'var(--bg-muted)' : 'transparent',
                }}>
                  <button
                    onClick={() => showSearch && !searchQuery ? closeSearch() : openSearch()}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13, color: showSearch ? '#D85A30' : 'var(--text-muted)',
                      padding: '4px 6px', flexShrink: 0,
                    }}
                  >🔍</button>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="搜索文章..."
                    value={searchQuery}
                    onChange={e => handleSearchInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
                    style={{
                      flex: 1,
                      padding: '4px 8px 4px 0',
                      fontSize: 12,
                      fontFamily: 'Georgia, serif',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      opacity: showSearch ? 1 : 0,
                      pointerEvents: showSearch ? 'auto' : 'none',
                      minWidth: 0,
                    }}
                  />
                  {showSearch && searchQuery && (
                    <button
                      onClick={closeSearch}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-faint)', padding: '4px 6px', flexShrink: 0,
                      }}
                    >✕</button>
                  )}
                </div>
              </div>
            )}

            {(['magazine', 'card', 'list', 'photo'] as ViewStyle[]).map(s => (
              <button key={s} onClick={() => setStyle(s)} style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                border: style === s ? 'none' : '0.5px solid var(--border)',
                background: style === s ? '#D85A30' : 'transparent',
                color: style === s ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {{ magazine: '杂志', card: '卡片', list: '列表', photo: '图片' }[s]}
              </button>
            ))}

            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

            <button onClick={handleTranslateAll} disabled={translating || translated} style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'Georgia, serif',
              border: '0.5px solid var(--border)',
              background: translated ? 'var(--success-bg)' : 'transparent',
              color: translated ? 'var(--success-text)' : 'var(--text-muted)',
              cursor: translating || translated ? 'default' : 'pointer',
            }}>
              {translating ? '翻译中...' : translated ? '✓ 已翻译' : '翻译'}
            </button>

            {isMobile && (
              <button onClick={showSearch ? closeSearch : openSearch} style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 14,
                border: 'none', background: 'none', cursor: 'pointer',
                color: showSearch ? '#D85A30' : 'var(--text-muted)',
              }}>🔍</button>
            )}
          </div>
        </div>
      </header>

      {/* Topic Navigation Bar */}
      {!loading && topics.length > 0 && (
        <nav style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 52, zIndex: 40,
          width: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
          <div style={{ ...containerStyle, display: 'flex', gap: 2, height: 48, alignItems: 'center', justifyContent: 'flex-start' }}>
            <button onClick={() => { setShowBookmarks(!showBookmarks); setShowSearch(false) }} style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontFamily: 'Georgia, serif',
              border: 'none',
              whiteSpace: 'nowrap',
              background: showBookmarks ? '#D85A30' : 'transparent',
              color: showBookmarks ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontWeight: showBookmarks ? 600 : 400,
              flexShrink: 0,
            }}>
              ★ <span style={{ fontSize: 11, marginLeft: 4, opacity: showBookmarks ? 0.8 : 0.5 }}>{bookmarks.size}</span>
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
            {topics.map(t => {
              const count = articles[t]?.length || 0
              const color = getTopicColor(t)
              return (
                <button key={t} onClick={() => scrollToTopic(t)} style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontFamily: 'Georgia, serif',
                  border: 'none',
                  whiteSpace: 'nowrap',
                  background: activeTopic === t ? color : 'transparent',
                  color: activeTopic === t ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: activeTopic === t ? 600 : 400,
                  flexShrink: 0,
                }}
                  onMouseEnter={e => { if (activeTopic !== t) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (activeTopic !== t) e.currentTarget.style.background = 'transparent' }}
                >
                  {t}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: activeTopic === t ? 0.8 : 0.5 }}>{count}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* Mobile search bar */}
      {isMobile && showSearch && (
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '8px 1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索文章..."
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              fontSize: 14, fontFamily: 'Georgia, serif',
              border: '0.5px solid var(--border)', background: 'var(--bg-muted)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button onClick={closeSearch} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text-faint)', padding: '4px 8px',
          }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ ...containerStyle, padding: isMobile ? '1.5rem 1rem' : '1.5rem 2rem' }}>
          <div className="skeleton" style={{ height: 28, width: 120, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton" style={{ height: 140, borderRadius: 10 }} />
            ))}
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-faint)' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无文章</p>
          <p style={{ fontSize: 13 }}>请前往 /admin 配置 AI 并触发抓取</p>
        </div>
      ) : (
        <main style={{ ...containerStyle, padding: isMobile ? '1rem' : '2rem 2rem' }}>

          {/* 双栏布局：左侧主内容 + 右侧智能边栏 */}
          <div style={mainGridStyle || {}}>

            {/* ====== 左侧主内容区 (70%) ====== */}
            <div className="content-area">

          {/* Search Results */}
          {showSearch && searchQuery && (
            <section style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: 8, borderBottom: '2px solid #D85A30' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2 }}>搜索结果</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--tag-bg)', padding: '2px 8px', borderRadius: 10 }}>
                  {searching ? '...' : searchResults.length} 篇
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>「{searchQuery}」</span>
              </div>
              {searching ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-faint)', fontSize: 14 }}>搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-faint)', fontSize: 14 }}>未找到相关文章</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                  {searchResults.map(a => renderCard(a))}
                </div>
              )}
            </section>
          )}

          {/* Bookmarks */}
          {showBookmarks && (
            <section style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: 8, borderBottom: '2px solid #D85A30' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2 }}>收藏文章</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--tag-bg)', padding: '2px 8px', borderRadius: 10 }}>{bookmarks.size} 篇</span>
              </div>
              {bookmarks.size === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-faint)', fontSize: 14 }}>
                  <p style={{ marginBottom: 8 }}>暂无收藏</p>
                  <p style={{ fontSize: 12 }}>点击文章卡片上的 ★ 即可收藏</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                  {Object.values(articles).flat().filter(a => bookmarks.has(a.id)).map(a => renderCard(a))}
                </div>
              )}
            </section>
          )}

          {/* Trending */}
          {trendingArticles.length > 0 && !showSearch && !showBookmarks && (
            <section style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: 8, borderBottom: '2px solid #D85A30' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2 }}>🔥 热门</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--tag-bg)', padding: '2px 8px', borderRadius: 10 }}>趋势</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: trendingCols, gap: 10 }}>
                {trendingArticles.map((a, i) => (
                  <div key={a.id} onClick={() => { setSelected(a); markRead(a.id) }} style={{
                    background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: 10,
                    padding: 12, cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#D85A30')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 24, fontWeight: 800, color: i < 3 ? '#D85A30' : 'var(--border)', lineHeight: 1 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)', paddingLeft: 28, marginBottom: 4 }}>
                      {translated && a.titleZh ? a.titleZh : a.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', paddingLeft: 28 }}>{a.source}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Hero (magazine only, non-mobile) */}
          {style === 'magazine' && topArticle && !isMobile && (
            <div ref={el => { if (el) sectionRefs.current[heroTopicKey] = el as HTMLDivElement }} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem',
              marginBottom: '2rem', paddingBottom: '1.5rem',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ cursor: 'pointer' }} onClick={() => { setSelected(topArticle); markRead(topArticle.id) }}>
                {topArticle.imageUrl && (
                  <img src={topArticle.imageUrl} alt="" style={{
                    width: '100%', height: 180, objectFit: 'cover',
                    borderRadius: 8, marginBottom: 12,
                  }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#D85A30', marginBottom: 6 }}>{topArticle.topic}</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 10, color: 'var(--text-primary)' }}>
                  {translated && topArticle.titleZh ? topArticle.titleZh : topArticle.title}
                </h2>
                {topArticle.summary && <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)', marginBottom: 10 }}>{topArticle.summary}</p>}
                <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{topArticle.source}</span>
                  <span>{timeAgo(topArticle.publishedAt || topArticle.createdAt)}</span>
                  <span style={{ color: 'var(--ai-text)', background: 'var(--ai-tag-bg)', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>✦ AI摘要</span>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.5rem' }}>
                {(articles[heroTopicKey] ?? []).slice(1, 4).map((a, i) => (
                  <div key={a.id} onClick={() => { setSelected(a); markRead(a.id) }} style={{ cursor: 'pointer', paddingBottom: 14, marginBottom: 14, borderBottom: i < 2 ? '0.5px solid var(--border-light)' : 'none' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: '#185FA5', marginBottom: 4 }}>{a.topic}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {translated && a.titleZh ? a.titleZh : a.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{a.source} · {timeAgo(a.publishedAt || a.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Headline Carousel - 头条轮播（仅桌面端） */}
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
            const canLoadMore = hasMoreState[topic] ?? false
            const isLoading = loadingMoreRef.current.has(topic)
            const color = getTopicColor(topic)

            return (
              <section
                key={topic}
                ref={el => { if (el) sectionRefs.current[topic] = el as HTMLDivElement }}
                style={{ marginBottom: '2rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>{topic}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--tag-bg)', padding: '2px 8px', borderRadius: 10 }}>{allArticles.length} 篇</span>
                </div>

                {(style === 'magazine' || style === 'card') && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                      {allArticles.map(a => renderCard(a))}
                    </div>
                    {loadMoreBtn(topic, canLoadMore, isLoading, color)}
                  </>
                )}

                {style === 'list' && (
                  <>
                    <div>{allArticles.map((a, i) => renderCard(a, i))}</div>
                    {loadMoreBtn(topic, canLoadMore, isLoading, color)}
                  </>
                )}

                {style === 'photo' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: photoCols, gap: 10 }}>
                      {allArticles.map(a => renderCard(a))}
                    </div>
                    {loadMoreBtn(topic, canLoadMore, isLoading, color)}
                  </>
                )}
              </section>
            )
          })}

            </div>{/* End content-area */}

            {/* ====== 右侧智能边栏 (30%) - 仅大屏显示 ====== */}
            {!isMobile && screenSize === 'large' && (
              <aside className="smart-sidebar" style={{ position: 'sticky', top: 110, height: 'fit-content' }}>

                {/* Widget 1: 今日热读排行 */}
                <div className="widget" style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #D85A30', letterSpacing: 0.5 }}>📈 今日热读</h3>
                  <div>
                    {trendingArticles.slice(0, 5).map((article, i) => (
                      <div key={i} onClick={() => { setSelected(article); markRead(article.id) }} style={{
                        display: 'flex', gap: 10, padding: '8px 0',
                        borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; (e.currentTarget.firstChild as HTMLElement).style.paddingLeft = '8px' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; (e.currentTarget.firstChild as HTMLElement).style.paddingLeft = '0' }}
                      >
                        <span style={{ fontSize: 18, fontWeight: 800, color: i < 3 ? '#D85A30' : 'var(--border)', minWidth: 20, transition: 'padding-left 0.2s' }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
                            {(translated && article.titleZh ? article.titleZh : article.title).length > 45 ? (translated && article.titleZh ? article.titleZh : article.title).slice(0, 45) + '...' : (translated && article.titleZh ? article.titleZh : article.title)}
                          </h4>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{article.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Widget 2: 趋势话题云 */}
                <div className="widget" style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #D85A30', letterSpacing: 0.5 }}>🔥 趋势话题</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {topics.slice(0, 9).map((topic, i) => (
                      <button key={topic} onClick={() => scrollToTopic(topic)} style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        background: activeTopic === topic ? getTopicColor(topic) : 'var(--bg-hover)',
                        color: activeTopic === topic ? '#fff' : 'var(--text-muted)',
                        fontSize: Math.max(11, 14 - i * 0.3),
                        fontWeight: i < 3 ? 600 : 400,
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { if (activeTopic !== topic) e.currentTarget.style.background = 'var(--bg-card)' }}
                      onMouseLeave={e => { if (activeTopic !== topic) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      >
                        #{topic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Widget 3: 快捷操作 */}
                <div className="widget">
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #D85A30', letterSpacing: 0.5 }}>⚡ 快捷操作</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={handleTranslateAll} disabled={translating || translated} style={{
                      padding: '10px 14px', borderRadius: 8,
                      border: '0.5px solid var(--border)',
                      background: translated ? 'var(--success-bg)' : 'transparent',
                      color: translated ? 'var(--success-text)' : 'var(--text-muted)',
                      cursor: translating || translated ? 'default' : 'pointer',
                      fontSize: 13, fontFamily: 'Georgia, serif',
                      textAlign: 'left', transition: 'all 0.2s',
                    }}>
                      {translating ? '🔄 翻译中...' : translated ? '✅ 已翻译' : '🌐 翻译所有标题'}
                    </button>
                    <button onClick={() => setShowBookmarks(!showBookmarks)} style={{
                      padding: '10px 14px', borderRadius: 8,
                      border: '0.5px solid var(--border)',
                      background: showBookmarks ? 'var(--bg-hover)' : 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 13, fontFamily: 'Georgia, serif',
                      textAlign: 'left', transition: 'all 0.2s',
                    }}>
                      ⭐ 查看收藏 ({bookmarks.size})
                    </button>
                  </div>
                </div>

              </aside>
            )}

          </div>{/* End mainGridStyle */}

        </main>
      )}

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
