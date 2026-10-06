import { createClient } from '@supabase/supabase-js'
import { backendConfig } from './backendConfig'

const { url, key, mode, error } = backendConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export const accountMode = mode
export const configurationError = error

// Only a publishable key belongs in the browser. RLS protects all account rows.
export const backend = accountMode && !configurationError
  ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
