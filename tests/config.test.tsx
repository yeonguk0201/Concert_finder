import { expect, test } from 'vitest'
import { backendConfig } from '../src/backendConfig'

test('empty config is preview; incomplete or invalid config never falls back to preview', () => {
  expect(backendConfig().mode).toBe(false)
  for (const [url, key] of [['https://example.supabase.co', ''], ['', 'sb_publishable_test'], ['https://', 'sb_publishable_test']]) {
    const config = backendConfig(url, key)
    expect(config.mode).toBe(true)
    expect(config.error).not.toBe('')
  }
})
test('secret and service-role keys are rejected; publishable and legacy anon keys work', () => {
  const legacy = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`
  for (const key of ['sb_secret_do_not_use', legacy('service_role')]) expect(backendConfig('https://example.supabase.co', key).error).not.toBe('')
  for (const key of ['sb_publishable_test', legacy('anon')]) expect(backendConfig('https://example.supabase.co', key).error).toBe('')
})
