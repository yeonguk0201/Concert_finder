import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import { parseEnv } from 'node:util'
import webpush from 'web-push'
import { createNotificationHandler } from '../supabase/functions/_shared/notification-http.mjs'
import { createPushSender } from '../supabase/functions/_shared/notification-transport.mjs'
import { prepareConfiguration } from '../scripts/prepare-supabase-push.mjs'

const secret = 'a'.repeat(64)
const request = (token = secret, method = 'POST') => new Request('https://example.test/functions/v1/notification-delivery', {
  method, headers: { authorization: `Bearer ${token}` },
})

test('cron endpoint rejects users/anonymous/misconfigured calls before any privileged work', async () => {
  let calls = 0
  const dispatch = async () => { calls++; return { claimed: 0 } }
  const handler = createNotificationHandler({ secret, dispatch, log: () => {} })
  for (const token of ['', 'user.jwt.token', 'b'.repeat(64), secret + 'extra']) {
    assert.equal((await handler(request(token))).status, 401)
  }
  assert.equal((await handler(request(secret, 'GET'))).status, 405)
  assert.equal((await createNotificationHandler({ secret: '', dispatch })(request())).status, 503)
  assert.equal(calls, 0)
  const result = await handler(request())
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), { claimed: 0 })
  assert.equal(calls, 1)
})

test('endpoint reports failures without exposing server messages and never replays a batch', async () => {
  const logs = []
  let calls = 0
  const handler = createNotificationHandler({ secret, log: text => logs.push(text), dispatch: async () => {
    calls++
    throw new Error('secret subscription user@example.test')
  } })
  const result = await handler(request())
  assert.equal(result.status, 500)
  assert.deepEqual(await result.json(), { error: 'WORKER_FAILED' })
  assert.equal(calls, 1)
  assert.equal(logs.join('').includes('user@example.test'), false)
})

test('edge transport encrypts with the existing VAPID keys and uses bounded native fetch', async () => {
  const keys = webpush.generateVAPIDKeys()
  webpush.setVapidDetails('mailto:test@example.test', keys.publicKey, keys.privateKey)
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const subscription = { endpoint: 'https://fcm.googleapis.com/test', keys: {
    p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 5).toString('base64url'),
  } }
  let captured
  const send = createPushSender(webpush, async (url, options) => { captured = { url, options }; return new Response(null, { status: 201 }) })
  await send(subscription, '{"body":"private message"}', { TTL: 30, topic: 'delivery' })
  assert.equal(captured.url, subscription.endpoint)
  assert.equal(captured.options.redirect, 'error')
  assert.equal(captured.options.headers.TTL, 30)
  assert.equal(captured.options.headers.Topic, 'delivery')
  assert.ok(captured.options.headers.Authorization.startsWith('vapid '))
  assert.equal(captured.options.body.toString().includes('private message'), false)
  assert.ok(captured.options.signal instanceof AbortSignal)
  await assert.rejects(createPushSender(webpush, async () => new Response(null, { status: 410 }))(subscription, '{}', { TTL: 30 }),
    error => error.statusCode === 410)
  await assert.rejects(createPushSender(webpush, async () => { throw new Error('timeout') })(subscription, '{}', { TTL: 30 }), /timeout/)
})

test('setup reuses its cron token, excludes privileged keys, and safely quotes Vault values', () => {
  const source = { SUPABASE_URL: 'https://testproject.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'must-not-export',
    VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: "mailto:o'hara@example.test" }
  const result = prepareConfiguration(source, secret)
  const env = parseEnv(result.env)
  assert.equal(env.NOTIFICATION_CRON_SECRET, secret)
  assert.equal(env.VAPID_SUBJECT, source.VAPID_SUBJECT)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(result.projectRef, 'testproject')
  assert.equal(result.sql.includes('must-not-export'), false)
  assert.equal(result.sql.includes(secret), true)
  assert.equal(prepareConfiguration(source).env.includes('NOTIFICATION_CRON_SECRET='), true)
  assert.throws(() => prepareConfiguration({ ...source, SUPABASE_URL: 'https://evil.test' }), /project URL/)
  assert.throws(() => prepareConfiguration(source, 'bad-token'), /existing cron secret/)
})
