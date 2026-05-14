'use client'

import { useState, useEffect } from 'react'

interface Feed {
  id: number
  name: string
  url: string
  topic: string
  enabled: boolean
  isBuiltin: boolean
  consecutiveErrors: number
  lastError: string | null
  lastSuccess: string | null
}

type AdminSection = 'dashboard' | 'feeds' | 'ai' | 'topics'

const NAV_ICONS: Record<AdminSection, string> = {
  dashboard: '○',
  feeds: '◈',
  ai: '◇',
  topics: '◉',
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [stats, setStats] = useState({ feeds: 0, articles: 0, lastFetch: '' })
  const [newFeed, setNewFeed] = useState({ name: '', url: '', topic: '' })
  const [saving, setSaving] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [initingDB, setInitingDB] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' }>({ text: '', type: 'success' })
  const [crawlLog, setCrawlLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch('/api/admin-login').then(r => {
      if (r.ok) setAuthed(true)
    }).finally(() => setChecking(false))
  }, [])

  const login = async () => {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) setAuthed(true)
    else setAuthError('密码错误')
  }

  useEffect(() => {
    if (!authed) return
    fetch('/api/feeds').then(r => r.json()).then(setFeeds)
    fetch('/api/config').then(r => r.json()).then(setConfig)
    fetch('/api/articles?count=true').then(r => r.json()).then(data => {
      setStats(prev => ({ ...prev, articles: data.total || 0 }))
    })
  }, [authed])

  useEffect(() => {
    setStats(prev => ({ ...prev, feeds: feeds.filter(f => f.enabled).length }))
  }, [feeds])

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: 'success' }), 4000)
  }

  const toggleFeed = async (id: number, enabled: boolean) => {
    await fetch('/api/feeds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) })
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled } : f))
  }

  const deleteFeed = async (id: number) => {
    if (!confirm('确认删除该源？')) return
    await fetch('/api/feeds', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setFeeds(prev => prev.filter(f => f.id !== id))
  }

  const addFeed = async () => {
    if (!newFeed.name || !newFeed.url || !newFeed.topic) return
    const res = await fetch('/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newFeed) })
    const row = await res.json()
    setFeeds(prev => [...prev, row])
    setNewFeed({ name: '', url: '', topic: '' })
    showMsg('源已添加')
  }

  const saveConfig = async () => {
    setSaving(true)
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    setSaving(false)
    showMsg('配置已保存')
  }

  const triggerInitDB = async () => {
    setInitingDB(true)
    try {
      const res = await fetch('/api/admin-init-db', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        showMsg('数据库初始化完成')
        fetch('/api/feeds').then(r => r.json()).then(setFeeds)
        fetch('/api/articles?count=true').then(r => r.json()).then(d => {
          setStats(prev => ({ ...prev, articles: d.total || 0 }))
        })
      } else {
        showMsg(`初始化失败：${data.error}`, 'error')
      }
    } catch {
      showMsg('初始化失败', 'error')
    }
    setInitingDB(false)
  }

  const triggerCrawl = async () => {
    setCrawling(true)
    setCrawlLog([])
    try {
      const res = await fetch('/api/admin-crawl', { method: 'POST' })
      if (!res.ok || !res.body) throw new Error('request failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let totalSaved = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'start') setCrawlLog([`开始抓取，共 ${evt.totalFeeds} 个源`])
            else if (evt.type === 'feed_start') setCrawlLog(prev => [...prev, `[${evt.feedIndex + 1}/${evt.totalFeeds}] ${evt.feedName}...`])
            else if (evt.type === 'feed_done') {
              const parts = [`✓ ${evt.feedName}: 存 ${evt.saved} 篇`]
              if (evt.skipped) parts.push(`跳过 ${evt.skipped}`)
              if (evt.error) parts.push(`错误: ${evt.error}`)
              setCrawlLog(prev => [...prev, parts.join('，')])
              totalSaved += evt.saved || 0
            } else if (evt.type === 'done') {
              setCrawlLog(prev => [...prev, `✓ 完成，共入库 ${totalSaved} 篇`])
            } else if (evt.type === 'error') {
              setCrawlLog(prev => [...prev, `✗ 错误: ${evt.message}`])
            }
          } catch {}
        }
      }
      showMsg('抓取完成')
    } catch {
      showMsg('抓取失败，请检查 AI 配置', 'error')
    }
    setCrawling(false)
  }

  const exportOpml = async () => {
    const res = await fetch('/api/opml')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'newspulse-feeds.opml'
    a.click()
    URL.revokeObjectURL(url)
    showMsg('OPML 导出成功')
  }

  const importOpml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const text = await file.text()
    try {
      const res = await fetch('/api/opml', { method: 'POST', body: text, headers: { 'Content-Type': 'application/xml' } })
      const data = await res.json()
      if (data.ok) {
        showMsg(`导入完成：${data.imported} 个新源，${data.skipped} 个跳过`)
        fetch('/api/feeds').then(r => r.json()).then(setFeeds)
      } else {
        showMsg(`导入失败：${data.error}`, 'error')
      }
    } catch {
      showMsg('导入失败', 'error')
    }
    setImporting(false)
    e.target.value = ''
  }

  const topics = [...new Set(feeds.map(f => f.topic))]
  const errorFeeds = feeds.filter(f => f.consecutiveErrors >= 3)

  const navItems: { key: AdminSection; label: string }[] = [
    { key: 'dashboard', label: '概览' },
    { key: 'feeds', label: 'RSS 源' },
    { key: 'ai', label: 'AI 配置' },
    { key: 'topics', label: '话题分类' },
  ]

  const navigateTo = (key: AdminSection) => {
    setSection(key)
    if (isMobile) setSidebarOpen(false)
  }

  // ───── Loading ─────
  if (checking) {
    return (
      <div style={styles.fullCenter}>
        <span style={styles.loadingText}>验证中···</span>
      </div>
    )
  }

  // ───── Login ─────
  if (!authed) {
    return (
      <div style={styles.fullCenter}>
        <div style={styles.loginCard}>
          <div style={styles.loginLogo}>
            News<span style={{ color: 'var(--accent)' }}>Pulse</span>
          </div>
          <p style={styles.loginSub}>管理后台</p>
          <input
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={styles.input}
            autoFocus
          />
          {authError && <p style={styles.errorText}>{authError}</p>}
          <button onClick={login} style={styles.primaryBtn}>进入后台</button>
        </div>
      </div>
    )
  }

  // ───── Admin shell ─────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', fontFamily: 'var(--font-body)' }}>

      {/* ── TOP HEADER ── */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.iconBtn}>
              {sidebarOpen ? '✕' : '☰'}
            </button>
          )}
          <span style={styles.logo}>
            News<span style={{ color: 'var(--accent)' }}>Pulse</span>
          </span>
          <span style={styles.adminBadge}>后台</span>
        </div>
        <a href="/" style={styles.backLink}>← 返回首页</a>
      </header>

      {/* ── MOBILE SIDEBAR OVERLAY ── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          ...styles.sidebar,
          transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
          position: isMobile ? 'fixed' : 'sticky',
          top: isMobile ? 60 : 60,
          height: isMobile ? 'calc(100vh - 60px)' : 'calc(100vh - 60px)',
          zIndex: isMobile ? 40 : 'auto',
          transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <p style={styles.sidebarLabel}>导航</p>
          {navItems.map(item => (
            <button key={item.key} onClick={() => navigateTo(item.key)}
              style={{
                ...styles.navBtn,
                background: section === item.key ? 'var(--bg-hover)' : 'transparent',
                color: section === item.key ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: section === item.key ? 600 : 400,
                borderLeft: section === item.key ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{NAV_ICONS[item.key]}</span>
              {item.label}
            </button>
          ))}

          {/* Sidebar stats summary */}
          <div style={styles.sidebarStats}>
            <div style={styles.sidebarStat}>
              <span style={styles.sidebarStatNum}>{stats.feeds}</span>
              <span style={styles.sidebarStatLabel}>活跃源</span>
            </div>
            <div style={styles.sidebarStat}>
              <span style={styles.sidebarStatNum}>{stats.articles.toLocaleString()}</span>
              <span style={styles.sidebarStatLabel}>文章</span>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{
          flex: 1,
          padding: isMobile ? '1.25rem 1rem' : '2rem 2.5rem',
          overflowY: 'auto',
          minWidth: 0,
        }}>

          {/* Toast notification */}
          {msg.text && (
            <div style={{
              ...styles.toast,
              background: msg.type === 'error' ? 'var(--error-bg)' : 'var(--success-bg)',
              color: msg.type === 'error' ? 'var(--error-text)' : 'var(--success-text)',
              borderColor: msg.type === 'error' ? 'var(--error-border)' : 'var(--ai-border)',
            }}>
              {msg.type === 'error' ? '✗ ' : '✓ '}{msg.text}
            </div>
          )}

          {/* ════ DASHBOARD ════ */}
          {section === 'dashboard' && (
            <div>
              <h2 style={styles.pageTitle}>概览</h2>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
                {[
                  { label: '活跃源', value: stats.feeds, sub: `共 ${feeds.length} 个` },
                  { label: '文章总数', value: stats.articles.toLocaleString(), sub: '累计入库' },
                  { label: '话题数', value: topics.length, sub: '个分类' },
                  { label: '异常源', value: errorFeeds.length, warn: errorFeeds.length > 0, sub: '连续失败≥3次' },
                ].map(s => (
                  <div key={s.label} style={{
                    ...styles.statCard,
                    borderColor: s.warn && s.value > 0 ? 'var(--error-border)' : 'var(--border)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.warn && s.value > 0 ? 'var(--error-text)' : 'var(--text-faint)', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: s.warn && s.value > 0 ? 'var(--error-text)' : 'var(--text-primary)', marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Error feeds */}
              {errorFeeds.length > 0 && (
                <div style={{ ...styles.card, borderColor: 'var(--error-border)', background: 'var(--error-bg)', marginBottom: '1.5rem' }}>
                  <div style={styles.cardTitle} className="text-error">⚠ 连续失败的源</div>
                  {errorFeeds.map(feed => (
                    <div key={feed.id} style={{ padding: '10px 0', borderBottom: '0.5px solid var(--error-border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1, minWidth: 120 }}>{feed.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--error-text)', background: 'var(--error-bg)', padding: '2px 7px', borderRadius: 4 }}>
                        失败 {feed.consecutiveErrors} 次
                      </span>
                      {feed.lastError && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', width: '100%', wordBreak: 'break-all', lineHeight: 1.5 }}>
                          {feed.lastError.slice(0, 120)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Operations */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>运维操作</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: crawlLog.length > 0 ? '1rem' : 0 }}>
                  <button onClick={triggerCrawl} disabled={crawling} style={{ ...styles.primaryBtn, minWidth: 140 }}>
                    {crawling ? '⟳ 抓取中...' : '▶ 立即抓取'}
                  </button>
                  <button onClick={triggerInitDB} disabled={initingDB} style={{ ...styles.secondaryBtn, minWidth: 120 }}>
                    {initingDB ? '初始化中...' : '初始化数据库'}
                  </button>
                </div>
                {crawlLog.length > 0 && (
                  <div style={styles.logBox}>
                    {crawlLog.map((line, i) => (
                      <div key={i} style={{
                        fontFamily: 'var(--font-mono)',
                        color: line.startsWith('✓') ? 'var(--success-text)'
                          : line.startsWith('✗') ? 'var(--error-text)'
                            : 'var(--text-secondary)',
                        padding: '1px 0',
                      }}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ FEEDS ════ */}
          {section === 'feeds' && (
            <div>
              <h2 style={styles.pageTitle}>RSS 源管理
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 400, color: 'var(--text-faint)', marginLeft: 10 }}>
                  {feeds.length} 个源
                </span>
              </h2>

              {/* Add feed */}
              <div style={{ ...styles.card, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
                  <div style={styles.cardTitle} className="mb-0">新增源</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={exportOpml} style={styles.outlineBtn}>↑ 导出 OPML</button>
                    <label style={{ ...styles.outlineBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                      {importing ? '导入中...' : '↓ 导入 OPML'}
                      <input type="file" accept=".opml,.xml" onChange={importOpml} style={{ display: 'none' }} disabled={importing} />
                    </label>
                  </div>
                </div>

                {/* Responsive form */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr',
                  gap: 8,
                  marginBottom: 10,
                }}>
                  <input
                    placeholder="名称"
                    value={newFeed.name}
                    onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))}
                    style={styles.input}
                  />
                  <input
                    placeholder="RSS URL"
                    value={newFeed.url}
                    onChange={e => setNewFeed(p => ({ ...p, url: e.target.value }))}
                    style={styles.input}
                  />
                  <input
                    placeholder="话题分类"
                    value={newFeed.topic}
                    onChange={e => setNewFeed(p => ({ ...p, topic: e.target.value }))}
                    style={styles.input}
                  />
                </div>
                <button onClick={addFeed} style={styles.primaryBtn}>添加源</button>
              </div>

              {/* Feed list */}
              <div style={styles.card}>
                {feeds.length === 0 ? (
                  <div style={styles.emptyState}>暂无 RSS 源，请添加</div>
                ) : (
                  feeds.map(feed => {
                    const isError = feed.consecutiveErrors >= 3
                    const isWarning = feed.consecutiveErrors >= 1 && feed.consecutiveErrors < 3
                    const dotColor = isError ? 'var(--error-text)' : isWarning ? '#d97706' : '#16a34a'
                    return (
                      <div key={feed.id} style={styles.feedRow}>
                        {/* Status dot */}
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: dotColor, flexShrink: 0, marginTop: 4,
                        }} title={feed.lastError || (feed.lastSuccess ? `最后成功：${feed.lastSuccess}` : '尚未抓取')} />

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{feed.name}</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                              padding: '2px 6px', borderRadius: 3,
                              background: feed.isBuiltin ? 'var(--ai-tag-bg)' : 'var(--tag-bg)',
                              color: feed.isBuiltin ? 'var(--ai-text)' : 'var(--text-muted)',
                            }}>
                              {feed.isBuiltin ? '内置' : '自定义'}
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', background: 'var(--tag-bg)', padding: '2px 7px', borderRadius: 3 }}>
                              {feed.topic}
                            </span>
                            {isError && (
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--error-text)', letterSpacing: '0.04em' }}>
                                失败 {feed.consecutiveErrors}×
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {isError && feed.lastError
                              ? feed.lastError.slice(0, 80)
                              : feed.url}
                          </div>
                        </div>

                        {/* Toggle + Delete */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => toggleFeed(feed.id, !feed.enabled)}
                            style={{
                              width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                              background: feed.enabled ? '#16a34a' : 'var(--border-strong)',
                              position: 'relative', transition: 'background 0.18s', flexShrink: 0,
                            }}
                            title={feed.enabled ? '点击禁用' : '点击启用'}
                          >
                            <span style={{
                              position: 'absolute', width: 17, height: 17, borderRadius: '50%', background: '#fff',
                              top: 2.5, left: feed.enabled ? 18.5 : 2.5, transition: 'left 0.18s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                          </button>
                          <button
                            onClick={() => deleteFeed(feed.id)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--text-faint)',
                              cursor: 'pointer', fontSize: 15, padding: '3px 5px',
                              borderRadius: 4, transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--error-text)'; e.currentTarget.style.background = 'var(--error-bg)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent' }}
                          >×</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* ════ AI CONFIG ════ */}
          {section === 'ai' && (
            <div>
              <h2 style={styles.pageTitle}>AI 配置</h2>
              <div style={{ ...styles.card, maxWidth: 580 }}>
                <div style={styles.cardTitle}>模型设置</div>
                {[
                  { key: 'ai_provider', label: '提供商', type: 'select', options: ['openai', 'anthropic', 'custom'] },
                  { key: 'ai_model', label: '模型', type: 'text', placeholder: 'gpt-4o-mini' },
                  { key: 'ai_api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
                  { key: 'ai_base_url', label: '自定义 Base URL', type: 'text', placeholder: 'https://your-proxy.com/v1（可选）' },
                ].map(field => (
                  <div key={field.key} style={styles.formGroup}>
                    <label style={styles.label}>{field.label}</label>
                    {field.type === 'select' ? (
                      <select
                        value={config[field.key] || ''}
                        onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={styles.select}
                      >
                        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={config[field.key] || ''}
                        onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={styles.input}
                      />
                    )}
                  </div>
                ))}

                <hr style={{ border: 'none', borderTop: '0.5px solid var(--border)', margin: '1.25rem 0' }} />
                <div style={styles.cardTitle}>抓取设置</div>
                {[
                  { key: 'summary_lang', label: '摘要语言', type: 'select', options: ['zh', 'en', 'keep'], desc: 'zh=中文，keep=保留原文' },
                  { key: 'summary_length', label: '摘要长度', type: 'select', options: ['short', 'standard', 'long'] },
                  { key: 'per_feed_limit', label: '每源最大抓取数', type: 'text', placeholder: '6' },
                  { key: 'retention_days', label: '文章保留天数', type: 'text', placeholder: '30' },
                ].map(field => (
                  <div key={field.key} style={styles.formGroup}>
                    <label style={styles.label}>
                      {field.label}
                      {field.desc && <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginLeft: 6 }}>({field.desc})</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={config[field.key] || ''}
                        onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={styles.select}
                      >
                        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={field.placeholder}
                        value={config[field.key] || ''}
                        onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={styles.input}
                      />
                    )}
                  </div>
                ))}

                <button onClick={saveConfig} disabled={saving} style={{ ...styles.primaryBtn, marginTop: 8 }}>
                  {saving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          )}

          {/* ════ TOPICS ════ */}
          {section === 'topics' && (
            <div>
              <h2 style={styles.pageTitle}>话题分类</h2>

              <div style={{ ...styles.card, maxWidth: 560, marginBottom: '1.25rem' }}>
                <div style={styles.cardTitle}>头版话题（Hero）</div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>杂志模式首页大图区域显示的话题</label>
                  <select
                    value={config.hero_topic || ''}
                    onChange={e => setConfig(p => ({ ...p, hero_topic: e.target.value }))}
                    style={styles.select}
                  >
                    <option value="">默认（第一个话题）</option>
                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={saveConfig} disabled={saving} style={styles.primaryBtn}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>

              <div style={styles.card}>
                <div style={styles.cardTitle}>全部话题</div>
                {topics.length === 0 ? (
                  <div style={styles.emptyState}>暂无话题，请先添加 RSS 源</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {topics.map(topic => {
                      const count = feeds.filter(f => f.topic === topic).length
                      return (
                        <div key={topic} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', background: 'var(--bg-muted)',
                          border: '0.5px solid var(--border)', borderRadius: 8,
                        }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>{topic}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{count} 源</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: '1rem', letterSpacing: '0.03em', lineHeight: 1.6 }}>
                  话题由 RSS 源的话题字段自动生成。修改源的话题字段即可调整分类。
                </p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}

// ─── Shared style objects ───────────────────────────────────────────────────
const styles = {
  fullCenter: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-page)',
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,

  loadingText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: '0.06em',
    color: 'var(--text-faint)',
  } as React.CSSProperties,

  loginCard: {
    background: 'var(--bg-card)',
    border: '0.5px solid var(--border)',
    borderRadius: 14,
    padding: '2.25rem 2rem',
    width: 'min(360px, 90vw)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
  } as React.CSSProperties,

  loginLogo: {
    fontFamily: 'var(--font-display)',
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    marginBottom: 4,
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  loginSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-faint)',
    marginBottom: '1.75rem',
  } as React.CSSProperties,

  errorText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--error-text)',
    marginBottom: 10,
  } as React.CSSProperties,

  header: {
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border)',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    padding: '0 1.5rem',
    justifyContent: 'space-between',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  } as React.CSSProperties,

  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  adminBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-faint)',
    background: 'var(--tag-bg)',
    padding: '3px 8px',
    borderRadius: 4,
  } as React.CSSProperties,

  backLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--accent)',
    textDecoration: 'none',
    letterSpacing: '0.02em',
    padding: '5px 12px',
    border: '0.5px solid var(--accent-border)',
    borderRadius: 6,
    transition: 'background 0.15s',
  } as React.CSSProperties,

  iconBtn: {
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 16,
  } as React.CSSProperties,

  sidebar: {
    width: 200,
    background: 'var(--bg-card)',
    borderRight: '0.5px solid var(--border)',
    padding: '1.5rem 1rem',
    overflowY: 'auto' as const,
    flexShrink: 0,
  } as React.CSSProperties,

  sidebarLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-faint)',
    marginBottom: 8,
    padding: '0 10px',
  } as React.CSSProperties,

  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left' as const,
    padding: '9px 10px',
    borderRadius: 7,
    fontSize: 13,
    cursor: 'pointer',
    border: 'none',
    marginBottom: 2,
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s',
    letterSpacing: '0.01em',
  } as React.CSSProperties,

  sidebarStats: {
    marginTop: '2rem',
    padding: '14px',
    background: 'var(--bg-muted)',
    borderRadius: 8,
    border: '0.5px solid var(--border)',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  } as React.CSSProperties,

  sidebarStat: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 3,
  } as React.CSSProperties,

  sidebarStatNum: {
    fontFamily: 'var(--font-mono)',
    fontSize: 18,
    fontWeight: 500,
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  sidebarStatLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-faint)',
  } as React.CSSProperties,

  toast: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: '0.02em',
    padding: '10px 16px',
    borderRadius: 8,
    marginBottom: '1.25rem',
    border: '0.5px solid',
  } as React.CSSProperties,

  pageTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: '1.5rem',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'baseline',
  } as React.CSSProperties,

  card: {
    background: 'var(--bg-card)',
    border: '0.5px solid var(--border)',
    borderRadius: 12,
    padding: '1.25rem 1.5rem',
    marginBottom: '1rem',
  } as React.CSSProperties,

  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--text-primary)',
    marginBottom: '1rem',
  } as React.CSSProperties,

  statCard: {
    background: 'var(--bg-card)',
    border: '0.5px solid',
    borderRadius: 10,
    padding: '1rem 1.25rem',
  } as React.CSSProperties,

  formGroup: {
    marginBottom: '1rem',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 6,
    fontWeight: 500,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '0.5px solid var(--border)',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  select: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '0.5px solid var(--border)',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  primaryBtn: {
    padding: '9px 22px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    fontWeight: 600,
    letterSpacing: '0.01em',
    transition: 'background 0.15s',
  } as React.CSSProperties,

  secondaryBtn: {
    padding: '9px 22px',
    background: 'var(--blue)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    letterSpacing: '0.01em',
    transition: 'background 0.15s',
  } as React.CSSProperties,

  outlineBtn: {
    padding: '7px 14px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '0.5px solid var(--border)',
    borderRadius: 7,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  feedRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '11px 0',
    borderBottom: '0.5px solid var(--border-light)',
  } as React.CSSProperties,

  logBox: {
    padding: '12px 14px',
    borderRadius: 8,
    background: 'var(--bg-muted)',
    border: '0.5px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: 1.9,
    maxHeight: 260,
    overflowY: 'auto' as const,
    marginTop: '1rem',
  } as React.CSSProperties,

  emptyState: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: '0.04em',
    color: 'var(--text-faint)',
    padding: '2rem 0',
    textAlign: 'center' as const,
  } as React.CSSProperties,
}