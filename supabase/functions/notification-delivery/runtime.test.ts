// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7'
import assert from 'node:assert/strict'
import { createPushSender } from '../_shared/notification-transport.mjs'
import { createNotificationHandler } from '../_shared/notification-http.mjs'

Deno.test('Deno encrypts Web Push and authenticates the cron request without Node HTTP', async () => {
  const keys = webpush.generateVAPIDKeys()
  webpush.setVapidDetails('mailto:test@example.test', keys.publicKey, keys.privateKey)
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const subscription = { endpoint: 'https://fcm.googleapis.com/test', keys: {
    p256dh: encode(publicBytes), auth: encode(crypto.getRandomValues(new Uint8Array(16))),
  } }
  let sends = 0
  const sender = createPushSender(webpush, async (url: string | Request | URL, options?: RequestInit) => {
    sends++
    assert.equal(url, subscription.endpoint)
    assert.ok(options)
    const headers = new Headers(options.headers)
    assert.ok(headers.get('Authorization')?.startsWith('vapid '))
    assert.equal(headers.get('TTL'), '30')
    assert.equal(headers.get('Topic'), 'delivery')
    assert.ok(options.body instanceof Uint8Array)
    assert.equal(new TextDecoder().decode(options.body).includes('secret message'), false)
    return new Response(null, { status: 201 })
  })
  const secret = 'c'.repeat(64)
  const handler = createNotificationHandler({ secret, log: () => {}, dispatch: async () => {
    await sender(subscription, '{"body":"secret message"}', { TTL: 30, topic: 'delivery' })
    return { claimed: 1, sent: 1 }
  } })
  assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 401)
  assert.equal(sends, 0)
  const result = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } }))
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), { claimed: 1, sent: 1 })
  assert.equal(sends, 1)
})
