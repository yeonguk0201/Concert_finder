import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { backendConfig } from './src/backendConfig.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // A client-side guard is too late: Vite has already embedded every referenced value.
  // Reject unsafe public configuration before either the dev server or build starts.
  if (backendConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY).error) {
    throw new Error('INVALID_PUBLIC_SUPABASE_CONFIG: use a publishable key or legacy anon key; server secrets cannot enter the client build')
  }
  return { plugins: [react()] }
})
