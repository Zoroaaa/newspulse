import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/schema.ts',
  out: './drizzle',
  connectionString: process.env.TURSO_DATABASE_URL!,
} satisfies Config
