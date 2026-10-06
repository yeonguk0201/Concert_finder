export function backendConfig(rawUrl = '', rawKey = '') {
  const url = rawUrl.trim()
  const key = rawKey.trim()
  const mode = Boolean(url || key)
  let validUrl = false
  let publicKey = key.startsWith('sb_publishable_')
  try { const parsed = new URL(url); validUrl = ['https:', 'http:'].includes(parsed.protocol) && Boolean(parsed.hostname) } catch { /* Incomplete URL. */ }
  if (!publicKey && key.split('.').length === 3) {
    try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { /* Not a public legacy key. */ }
  }
  return { url, key, mode, error: mode && (!validUrl || !publicKey) ? 'Supabase URL과 공개용 키 설정을 확인해 주세요.' : '' }
}
