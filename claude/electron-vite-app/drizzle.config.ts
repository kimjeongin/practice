import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './agent.db',
  },
  verbose: true,
  strict: true,
})