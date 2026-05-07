import { eq } from 'drizzle-orm'
import { db } from './db'
import { config } from './schema'

export async function getConfig(key: string, defaultValue: string = ''): Promise<string> {
  const rows = await db.select().from(config).where(eq(config.key, key))
  return rows[0]?.value ?? defaultValue
}

export async function getConfigNumber(key: string, defaultValue: number): Promise<number> {
  const value = await getConfig(key, String(defaultValue))
  const num = Number(value)
  return isNaN(num) ? defaultValue : num
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await db.select().from(config)
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
