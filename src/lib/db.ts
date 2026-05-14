import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

function createDatabaseClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || url === 'undefined') {
    throw new Error(
      'TURSO_DATABASE_URL is not configured. Please check your .env file.'
    )
  }

  const client = createClient({
    url,
    authToken: authToken || undefined,
  })

  return drizzle(client, { schema })
}

export const db = createDatabaseClient()
