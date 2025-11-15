import { defineConfig } from 'drizzle-kit'

// dotenv-cli will load .env *before* this file runs,
// so process.env.DATABASE_URL will be set.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/**/*.ts', // adjust if your schema path is different
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
