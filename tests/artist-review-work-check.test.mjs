import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReviewWork } from '../scripts/check-artist-review-work.mjs'
import { createArtistReviewHandler } from '../supabase/functions/_shared/artist-review-runner.mjs'

const endpoint = 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner'
const secret = 'test-only-scoped-key-'.repeat(3)
const env = { ARTIST_REVIEW_ENDPOINT: endpoint, ARTIST_REVIEW_RUNNER_SECRET: secret }

test('polling uses only the scoped read RPC; idle never claims or calls a provider/model', async () => {
  const calls = []
  const handler = createArtistReviewHandler({ secret, rpc: async (name, args) => {
    calls.push({ name, args })
    return { data: { state: 'idle', reason: 'no_work', eligible: 0, notices: 0 } }
  }, fetcher: () => { throw new Error('PROVIDER_CALL_FORBIDDEN') } })
  const result = await checkReviewWork({ env, fetcher: async (url, options) => {
    assert.equal(url, endpoint); assert.equal(options.redirect, 'error')
    const body = JSON.parse(options.body)
    assert.equal(body.action, 'readiness')
    assert.match(body.runId, /^[a-f0-9-]{36}$/)
    return handler(new Request(url, options))
  } })
  assert.deepEqual(result, { state: 'idle', reason: 'no_work', eligible: 0, notices: 0, manualReviewRequired: false })
  assert.deepEqual(calls, [{ name: 'service_artist_review_readiness', args: {} }])
})
test('work, expired leases and pending notices request manual review without dispatching a model', async () => {
  for (const body of [
    { state: 'ready', reason: 'review_due', eligible: 10, notices: 0 },
    { state: 'ready', reason: 'lease_recovery', eligible: 0, notices: 0 },
    { state: 'busy', reason: 'lease_active', eligible: 0, notices: 2 },
  ]) assert.equal((await checkReviewWork({ env, fetcher: async () => Response.json(body) })).manualReviewRequired, true)
  assert.equal((await checkReviewWork({ env, fetcher: async () => Response.json({ state: 'busy', reason: 'lease_active', eligible: 0, notices: 0 }) })).manualReviewRequired, false)
})
test('missing bindings and wrong hosts never send credentials; auth/network/provider bodies are redacted', async () => {
  let calls = 0
  for (const badEnv of [{}, { ...env, ARTIST_REVIEW_ENDPOINT: 'https://evil.example.com/' }]) {
    await assert.rejects(checkReviewWork({ env: badEnv, fetcher: () => { calls++ } }), /RUNNER_CONFIGURATION_REQUIRED/)
  }
  assert.equal(calls, 0)
  await assert.rejects(checkReviewWork({ env, fetcher: async () => { throw new Error(secret) } }), /^Error: READINESS_UNAVAILABLE$/)
  await assert.rejects(checkReviewWork({ env, fetcher: async () => new Response(secret, { status: 401 }) }), /^Error: RUNNER_UNAUTHORIZED$/)
  for (const body of [secret, '{}', JSON.stringify({ state: 'ready', reason: 'review_due', eligible: 11, notices: 0 }),
    JSON.stringify({ state: 'idle', reason: 'no_work', eligible: 0, notices: 0, secret })]) {
    await assert.rejects(checkReviewWork({ env, fetcher: async () => new Response(body) }), /^Error: INVALID_READINESS_RESPONSE$/)
  }
})
test('readiness requires scoped auth and rejects extra selectors before RPC execution', async () => {
  let calls = 0
  const handler = createArtistReviewHandler({ secret, rpc: async () => { calls++; return { data: {} } } })
  const request = (body, token) => new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const body = { action: 'readiness', runId: crypto.randomUUID() }
  assert.equal((await handler(request(body, 'wrong'))).status, 401)
  assert.equal((await handler(request({ ...body, bandId: crypto.randomUUID() }, secret))).status, 400)
  assert.equal(calls, 0)
})
