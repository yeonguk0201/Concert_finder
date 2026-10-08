import { timingSafeEqual } from 'node:crypto'

// The endpoint can send across accounts; a user session must never authorize it.
export function createNotificationHandler({ secret, dispatch, log = console.log }) {
  return async request => {
    const respond = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
    if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405)
    if (!secret || secret.length < 32) return respond({ error: 'WORKER_NOT_CONFIGURED' }, 503)
    const encoder = new TextEncoder()
    const expected = encoder.encode(`Bearer ${secret}`)
    const actual = encoder.encode(request.headers.get('authorization') ?? '')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return respond({ error: 'UNAUTHORIZED' }, 401)
    try {
      const counts = await dispatch()
      log(JSON.stringify({ event: 'notification_batch', ...counts }))
      return respond(counts)
    } catch {
      // RPC failures can contain subscription keys or user information.
      log(JSON.stringify({ event: 'notification_batch', error: 'WORKER_FAILED' }))
      return respond({ error: 'WORKER_FAILED' }, 500)
    }
  }
}
