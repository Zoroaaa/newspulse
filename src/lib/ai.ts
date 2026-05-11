import { db } from './db'
import { config } from './schema'

export interface AIConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  summaryLang: string
  summaryLength: string
}

export async function getAIConfig(): Promise<AIConfig> {
  const rows = await db.select().from(config)
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return {
    provider: map.ai_provider || process.env.AI_PROVIDER || 'openai',
    model: map.ai_model || process.env.AI_MODEL || 'gpt-4o-mini',
    apiKey: map.ai_api_key || process.env.AI_API_KEY || '',
    baseUrl: map.ai_base_url || process.env.AI_BASE_URL,
    summaryLang: map.summary_lang || 'zh',
    summaryLength: map.summary_length || 'standard',
  }
}

function getLengthInstruction(length: string): string {
  if (length === 'short') return '50字以内'
  if (length === 'long') return '200字以内'
  return '100字以内'
}

// 核心调用，接受预加载的 cfg，不再内部查 DB
async function callAIWithConfig(cfg: AIConfig, systemPrompt: string, userContent: string, timeoutMs = 30000, maxTokens = 1024): Promise<string> {
  if (!cfg.apiKey) throw new Error('AI API Key not configured')

  const baseUrl = cfg.baseUrl || (cfg.provider === 'anthropic'
    ? 'https://api.anthropic.com/v1'
    : 'https://api.openai.com/v1')

  if (cfg.provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// 单次场景的便捷包装（自动加载 config）
async function callAI(systemPrompt: string, userContent: string, timeoutMs = 30000, maxTokens = 1024): Promise<string> {
  const cfg = await getAIConfig()
  return callAIWithConfig(cfg, systemPrompt, userContent, timeoutMs, maxTokens)
}

// cfg 可选传入：批量爬取时由外部传入预加载的 config，避免每篇文章查一次 DB
export async function generateSummary(
  title: string,
  rawText: string,
  cfg?: AIConfig
): Promise<{ summary: string; titleZh: string }> {
  const resolvedCfg = cfg ?? await getAIConfig()
  const lengthInstruction = getLengthInstruction(resolvedCfg.summaryLength)
  const langInstruction = resolvedCfg.summaryLang === 'zh' ? '用中文输出' : 'output in English'

  const result = await callAIWithConfig(
    resolvedCfg,
    `你是新闻摘要助手。${langInstruction}。严格返回JSON格式：{"titleZh":"...","summary":"..."}，不要其他内容。`,
    `标题：${title}\n\n正文：${rawText.slice(0, 2000)}\n\n要求：翻译标题为中文（titleZh），生成${lengthInstruction}的摘要（summary）。`
  )

  try {
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { summary: rawText.slice(0, 200), titleZh: title }
  }
}

export async function translateArticle(title: string, content: string): Promise<{ titleZh: string; contentZh: string }> {
  const result = await callAI(
    '你是专业翻译。将新闻内容翻译为中文。严格返回JSON格式：{"titleZh":"...","contentZh":"..."}，不要其他内容。',
    `标题：${title}\n\n正文：${content}`,
    60000,  // 长文翻译给更多时间
    8192    // 足够输出完整译文
  )

  try {
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { titleZh: title, contentZh: content }
  }
}

export async function translateTitles(titles: { id: number; title: string }[]): Promise<Record<number, string>> {
  const BATCH_SIZE = 10
  const batches: { id: number; title: string }[][] = []
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    batches.push(titles.slice(i, i + BATCH_SIZE))
  }

  // 只查一次 config，所有 batch 复用
  const cfg = await getAIConfig()

  const results = await Promise.all(
    batches.map(async (batch) => {
      const result = await callAIWithConfig(
        cfg,
        '你是翻译助手。将英文标题翻译为中文。严格返回JSON格式：{"translations":[{"id":1,"zh":"..."},...]}，不要其他内容。',
        JSON.stringify(batch.map(t => ({ id: t.id, en: t.title }))),
        60000
      )
      try {
        const clean = result.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(clean)
        const map: Record<number, string> = {}
        for (const t of parsed.translations || []) map[t.id] = t.zh
        return map
      } catch {
        return {}
      }
    })
  )

  return Object.assign({}, ...results)
}
