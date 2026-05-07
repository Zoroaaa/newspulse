import { db } from './db'
import { config } from './schema'
import { eq } from 'drizzle-orm'

interface AIConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  summaryLang: string
  summaryLength: string
}

async function getAIConfig(): Promise<AIConfig> {
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

async function callAI(systemPrompt: string, userContent: string): Promise<string> {
  const cfg = await getAIConfig()
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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  // OpenAI compatible
  const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function generateSummary(title: string, rawText: string): Promise<{ summary: string; titleZh: string }> {
  const cfg = await getAIConfig()
  const lengthInstruction = getLengthInstruction(cfg.summaryLength)
  const langInstruction = cfg.summaryLang === 'zh' ? '用中文输出' : 'output in English'

  const result = await callAI(
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
    `标题：${title}\n\n正文：${content.slice(0, 6000)}`
  )

  try {
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { titleZh: title, contentZh: content }
  }
}

export async function translateTitles(titles: { id: number; title: string }[]): Promise<Record<number, string>> {
  const result = await callAI(
    '你是翻译助手。将英文标题翻译为中文。严格返回JSON格式：{"translations":[{"id":1,"zh":"..."},...]}，不要其他内容。',
    JSON.stringify(titles.map(t => ({ id: t.id, en: t.title })))
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
}
