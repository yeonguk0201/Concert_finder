import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('Vite rejects server secrets before compilation and accepts only public client configuration', () => {
  const code = "import {resolveConfig} from 'vite'; await resolveConfig({configFile:'vite.config.ts'},'build');"
  const check = key => spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', env: { ...process.env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key },
  })
  const rejected = check('sb_secret_test_not_a_real_key')
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /INVALID_PUBLIC_SUPABASE_CONFIG/)
  assert.doesNotMatch(rejected.stderr, /sb_secret_test_not_a_real_key/)
  assert.equal(check('sb_publishable_test_not_a_real_key').status, 0)
})
