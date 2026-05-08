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
  const [msg, setMsg] = useState('')
  const [crawlLog, setCrawlLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

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

  const toggleFeed = async (id: number, enabled: boolean) => {
    await fetch('/api/feeds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) })
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled } : f))
  }

  const deleteFeed = async (id: number) => {
    if (!confirm('确认删除？')) return
    await fetch('/api/feeds', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setFeeds(prev => prev.filter(f => f.id !== id))
  }

  const addFeed = async () => {
    if (!newFeed.name || !newFeed.url || !newFeed.topic) return
    const res = await fetch('/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newFeed) })
    const row = await res.json()
    setFeeds(prev => [...prev, row])
    setNewFeed({ name: '', url: '', topic: '' })
  }

  const saveConfig = async () => {
    setSaving(true)
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    setSaving(false)
    setMsg('保存成功')
    setTimeout(() => setMsg(''), 2000)
  }

  const triggerInitDB = async () => {
    setInitingDB(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin-init-db', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMsg('数据库初始化完成')
        fetch('/api/feeds').then(r => r.json()).then(setFeeds)
        fetch('/api/articles?count=true').then(r => r.json()).then(d => {
          setStats(prev => ({ ...prev, articles: d.total || 0 }))
        })
      } else {
        setMsg(`初始化失败：${data.error}`)
      }
    } catch {
      setMsg('初始化失败')
    }
    setInitingDB(false)
    setTimeout(() => setMsg(''), 5000)
  }

  const triggerCrawl = async () => {
    setCrawling(true)
    setCrawlLog([])
    setMsg('')
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
            if (evt.type === 'start') {
              setCrawlLog([`开始抓取，共 ${evt.totalFeeds} 个源`])
            } else if (evt.type === 'feed_start') {
              setCrawlLog(prev => [...prev, `[${evt.feedIndex + 1}/${evt.totalFeeds}] ${evt.feedName}...`])
            } else if (evt.type === 'feed_done') {
              const parts = [`✓ ${evt.feedName}: 存 ${evt.saved} 篇`]
              if (evt.skipped) parts.push(`跳过 ${evt.skipped}`)
              if (evt.error) parts.push(`错误: ${evt.error}`)
              setCrawlLog(prev => [...prev, parts.join('，')])
              totalSaved += evt.saved || 0
            } else if (evt.type === 'done') {
              setCrawlLog(prev => [...prev, `完成，共入库 ${totalSaved} 篇`])
            } else if (evt.type === 'error') {
              setCrawlLog(prev => [...prev, `错误: ${evt.message}`])
            }
          } catch {}
        }
      }
      setMsg('抓取完成')
    } catch {
      setMsg('抓取失败，请检查 AI 配置')
    }
    setCrawling(false)
    setTimeout(() => setMsg(''), 5000)
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
    setMsg('OPML 导出成功')
    setTimeout(() => setMsg(''), 2000)
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
        setMsg(`导入完成：${data.imported} 个新源，${data.skipped} 个跳过`)
        fetch('/api/feeds').then(r => r.json()).then(setFeeds)
      } else {
        setMsg(`导入失败：${data.error}`)
      }
    } catch {
      setMsg('导入失败')
    }
    setImporting(false)
    e.target.value = ''
    setTimeout(() => setMsg(''), 5000)
  }

  const topics = [...new Set(feeds.map(f => f.topic))]

  // Login screen
  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f3ee', fontFamily: 'Georgia, serif' }}>
        <div style={{ fontSize: 14, color: '#999' }}>验证中...</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f3ee', fontFamily: 'Georgia, serif' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 12, padding: '2rem', width: 320 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: '1.5rem' }}>
            News<span style={{ color: '#D85A30' }}>Pulse</span>
          </div>
          <input
            type="password" placeholder="管理员密码" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 14, fontFamily: 'Georgia, serif', marginBottom: 8, outline: 'none' }}
          />
          {authError && <div style={{ fontSize: 12, color: '#c62828', marginBottom: 8 }}>{authError}</div>}
          <button onClick={login} style={{ width: '100%', padding: '10px', background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
            进入后台
          </button>
        </div>
      </div>
    )
  }

  const navItems: { key: AdminSection; label: string }[] = [
    { key: 'dashboard', label: '概览' },
    { key: 'feeds', label: 'RSS 源' },
    { key: 'ai', label: 'AI 配置' },
    { key: 'topics', label: '话题分类' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ee', fontFamily: 'Georgia, serif' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e0ddd6', height: 52, display: 'flex', alignItems: 'center', padding: '0 1.5rem', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>News<span style={{ color: '#D85A30' }}>Pulse</span> <span style={{ fontSize: 13, color: '#999', fontWeight: 400 }}>后台</span></div>
        <a href="/" style={{ fontSize: 13, color: '#D85A30', textDecoration: 'none' }}>← 返回首页</a>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <div style={{ background: '#fff', borderRight: '0.5px solid #e0ddd6', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#999', marginBottom: 12, padding: '0 8px' }}>管理</div>
          {navItems.map(item => (
            <button key={item.key} onClick={() => setSection(item.key)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: 'none', marginBottom: 2,
              background: section === item.key ? '#f5f3ee' : 'transparent',
              color: section === item.key ? '#1a1a1a' : '#666',
              fontWeight: section === item.key ? 600 : 400,
              fontFamily: 'Georgia, serif',
            }}>{item.label}</button>
          ))}
        </div>

        {/* Main */}
        <div style={{ padding: '2rem', overflowY: 'auto' }}>
          {msg && <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: '8px 14px', borderRadius: 8, marginBottom: '1rem', fontSize: 13 }}>{msg}</div>}

          {/* Dashboard */}
          {section === 'dashboard' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: '1.5rem' }}>概览</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
                {[
                  { label: '已启用源', value: stats.feeds },
                  { label: '文章总数', value: stats.articles },
                  { label: '话题数', value: topics.length },
                  { label: '异常源', value: feeds.filter(f => f.consecutiveErrors >= 3).length, warn: true },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', border: `0.5px solid ${s.warn && (s.value as number) > 0 ? '#f44336' : '#e0ddd6'}`, borderRadius: 10, padding: '1rem' }}>
                    <div style={{ fontSize: 12, color: s.warn && (s.value as number) > 0 ? '#c62828' : '#999', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: s.warn && (s.value as number) > 0 ? '#c62828' : 'inherit' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* 异常源列表 */}
              {feeds.filter(f => f.consecutiveErrors >= 3).length > 0 && (
                <div style={{ background: '#fff3f3', border: '0.5px solid #ffcdd2', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#c62828', marginBottom: '0.75rem' }}>⚠️ 连续失败的源</div>
                  {feeds.filter(f => f.consecutiveErrors >= 3).map(feed => (
                    <div key={feed.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #ffcdd2', fontSize: 13 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{feed.name}</span>
                        <span style={{ fontSize: 11, color: '#e57373', marginLeft: 8 }}>连续失败 {feed.consecutiveErrors} 次</span>
                      </div>
                      {feed.lastError && (
                        <div style={{ fontSize: 11, color: '#999', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={feed.lastError}>
                          {feed.lastError}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>运维操作</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={triggerCrawl} disabled={crawling} style={{
                    padding: '8px 20px', background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, cursor: crawling ? 'default' : 'pointer', fontFamily: 'Georgia, serif',
                  }}>{crawling ? '抓取中...' : '立即抓取所有源'}</button>
                  <button onClick={triggerInitDB} disabled={initingDB} style={{
                    padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, cursor: initingDB ? 'default' : 'pointer', fontFamily: 'Georgia, serif',
                  }}>{initingDB ? '初始化中...' : '初始化数据库'}</button>
                </div>
                {crawlLog.length > 0 && (
                  <div style={{
                    marginTop: '1rem', padding: '10px 12px', borderRadius: 8,
                    background: '#f8f7f4', border: '0.5px solid #e8e6e0',
                    fontFamily: 'Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.8,
                    maxHeight: 240, overflowY: 'auto', color: '#444',
                  }}>
                    {crawlLog.map((line, i) => (
                      <div key={i} style={{
                        color: line.startsWith('✓') ? '#2e7d32' : line.startsWith('错误') ? '#c62828' : '#555',
                      }}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feeds */}
          {section === 'feeds' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: '1.5rem' }}>RSS 源管理</h2>

              {/* Add feed */}
              <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>新增源</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={exportOpml} style={{ padding: '5px 14px', background: '#639922', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>导出 OPML</button>
                    <label style={{ padding: '5px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'Georgia, serif', display: 'inline-block' }}>
                      {importing ? '导入中...' : '导入 OPML'}
                      <input type="file" accept=".opml,.xml" onChange={importOpml} style={{ display: 'none' }} disabled={importing} />
                    </label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="名称" value={newFeed.name} onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif' }} />
                  <input placeholder="RSS URL" value={newFeed.url} onChange={e => setNewFeed(p => ({ ...p, url: e.target.value }))}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif' }} />
                  <input placeholder="话题" value={newFeed.topic} onChange={e => setNewFeed(p => ({ ...p, topic: e.target.value }))}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif' }} />
                </div>
                <button onClick={addFeed} style={{ padding: '7px 18px', background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>添加</button>
              </div>

              {/* Feed list */}
              <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10, padding: '1.25rem' }}>
                {feeds.map(feed => {
                  const isHealthy = feed.consecutiveErrors === 0
                  const isWarning = feed.consecutiveErrors >= 1 && feed.consecutiveErrors < 3
                  const isError = feed.consecutiveErrors >= 3
                  const dotColor = isError ? '#f44336' : isWarning ? '#ff9800' : '#4caf50'
                  const dotTitle = isError
                    ? `连续失败 ${feed.consecutiveErrors} 次\n${feed.lastError || ''}`
                    : isWarning
                    ? `失败 ${feed.consecutiveErrors} 次\n${feed.lastError || ''}`
                    : feed.lastSuccess
                    ? `最后成功：${new Date(feed.lastSuccess).toLocaleString('zh-CN')}`
                    : '尚未抓取'
                  return (
                    <div key={feed.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #eee', fontSize: 13 }}>
                      {/* 健康状态指示点 */}
                      <span title={dotTitle} style={{
                        width: 8, height: 8, borderRadius: '50%', background: dotColor,
                        flexShrink: 0, cursor: 'default',
                        boxShadow: isError ? '0 0 0 2px #ffcdd2' : isWarning ? '0 0 0 2px #ffe0b2' : 'none',
                      }} />
                      <div style={{ flex: 1, fontWeight: 500 }}>{feed.name}</div>
                      <div style={{ fontSize: 11, color: '#888', background: '#f5f3ee', padding: '2px 8px', borderRadius: 4 }}>{feed.topic}</div>
                      {/* 错误信息（仅异常源显示） */}
                      {isError && feed.lastError && (
                        <div style={{ fontSize: 11, color: '#e57373', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={feed.lastError}>
                          {feed.lastError.replace('Error: ', '')}
                        </div>
                      )}
                      {!isError && (
                        <div style={{ fontSize: 11, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{feed.url}</div>
                      )}
                      {/* Toggle */}
                      <button onClick={() => toggleFeed(feed.id, !feed.enabled)} style={{
                        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: feed.enabled ? '#639922' : '#ccc',
                        position: 'relative', transition: 'background 0.15s', flexShrink: 0,
                      }}>
                        <span style={{
                          position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          top: 2, left: feed.enabled ? 18 : 2, transition: 'left 0.15s',
                        }} />
                      </button>
                      {!feed.isBuiltin && (
                        <button onClick={() => deleteFeed(feed.id)} style={{ background: 'none', border: 'none', color: '#e57373', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI Config */}
          {section === 'ai' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: '1.5rem' }}>AI 配置</h2>
              <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10, padding: '1.5rem', maxWidth: 560 }}>
                {[
                  { key: 'ai_provider', label: '提供商', type: 'select', options: ['openai', 'anthropic', 'custom'] },
                  { key: 'ai_model', label: '模型', type: 'text', placeholder: 'gpt-4o-mini' },
                  { key: 'ai_api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
                  { key: 'ai_base_url', label: '自定义 Base URL（可选）', type: 'text', placeholder: 'https://your-proxy.com/v1' },
                  { key: 'summary_lang', label: '摘要语言', type: 'select', options: ['zh', 'en', 'keep'] },
                  { key: 'summary_length', label: '摘要长度', type: 'select', options: ['short', 'standard', 'long'] },
                  { key: 'per_feed_limit', label: '每源最大抓取数', type: 'text', placeholder: '6' },
                  { key: 'retention_days', label: '文章保留天数', type: 'text', placeholder: '30' },
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#666', marginBottom: 6 }}>{field.label}</label>
                    {field.type === 'select' ? (
                      <select value={config[field.key] || ''} onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif', background: '#fff' }}>
                        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={field.type} placeholder={field.placeholder} value={config[field.key] || ''}
                        onChange={e => setConfig(p => ({ ...p, [field.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif' }} />
                    )}
                  </div>
                ))}
                <button onClick={saveConfig} disabled={saving} style={{
                  padding: '9px 24px', background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>{saving ? '保存中...' : '保存配置'}</button>
              </div>
            </div>
          )}

          {/* Topics */}
          {section === 'topics' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: '1.5rem' }}>话题分类</h2>
              <div style={{ background: '#fff', border: '0.5px solid #e0ddd6', borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '0.5px solid #eee' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#666', marginBottom: 6 }}>头版分组（Hero）</label>
                  <select value={config.hero_topic || ''} onChange={e => setConfig(p => ({ ...p, hero_topic: e.target.value }))}
                    style={{ width: '100%', maxWidth: 300, padding: '8px 10px', borderRadius: 8, border: '0.5px solid #ccc', fontSize: 13, fontFamily: 'Georgia, serif', background: '#fff' }}>
                    <option value="">默认（第一个话题）</option>
                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>杂志模式下首页头条区域显示的分组，保存后生效。</p>
                  <button onClick={saveConfig} disabled={saving} style={{
                    marginTop: 8, padding: '7px 20px', background: '#D85A30', color: '#fff', border: 'none',
                    borderRadius: 8, fontSize: 13, cursor: saving ? 'default' : 'pointer', fontFamily: 'Georgia, serif',
                  }}>{saving ? '保存中...' : '保存配置'}</button>
                </div>
                {topics.map(topic => {
                  const count = feeds.filter(f => f.topic === topic).length
                  return (
                    <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #eee', fontSize: 13 }}>
                      <div style={{ flex: 1, fontWeight: 500 }}>{topic}</div>
                      <div style={{ fontSize: 11, color: '#888', background: '#f5f3ee', padding: '2px 8px', borderRadius: 4 }}>{count} 个源</div>
                    </div>
                  )
                })}
                <p style={{ fontSize: 12, color: '#aaa', marginTop: '1rem' }}>话题由 RSS 源的话题字段自动生成，修改源的话题即可调整分类。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
