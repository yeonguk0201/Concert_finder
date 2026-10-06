import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
export const accountMode = Boolean(url || key)
let validUrl = false
try { const parsed = new URL(url); validUrl = ['https:', 'http:'].includes(parsed.protocol) && Boolean(parsed.hostname) } catch { /* Incomplete configuration. */ }
export const configurationError = accountMode && (!validUrl || !key || key.startsWith('sb_secret_'))
  ? 'Supabase URL과 공개용 키 설정을 확인해 주세요.' : ''

// Only a publishable key belongs in the browser. RLS protects all account rows.
export const backend = accountMode && !configurationError
  ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
