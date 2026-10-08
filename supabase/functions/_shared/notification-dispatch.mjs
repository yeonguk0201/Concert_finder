// Subscription URLs are untrusted even when the DB has already validated them.
export function allowedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
  } catch { return false }
}
export function pushOutcome(error) {
  const status = error?.statusCode
  if (status === 404 || status === 410) return { outcome: 'invalid_device', error_code: `HTTP_${status}` }
  if (status === 429 || (status >= 500 && status <= 599)) return { outcome: 'retry', error_code: `HTTP_${status}` }
  // No response/timeout may mean accepted delivery. Avoid automatic duplicates.
  return { outcome: 'failed', error_code: status ? `HTTP_${status}` : 'UNKNOWN_OUTCOME' }
}
export async function dispatchNotifications({ rpc, send, concurrency = 1 }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) throw new Error('INVALID_CONCURRENCY')
  const batch = await rpc('claim_notification_batch', {})
  const counts = { claimed: batch.length, sent: 0, skipped: 0, retry: 0, failed: 0, invalid_device: 0 }
  let cursor = 0
  const consume = async () => {
    while (cursor < batch.length) {
      const row = batch[cursor++]
      const identity = { delivery_id: row.id, token: row.lease_token }
      const message = await rpc('authorize_notification', identity)
      if (!message) { counts.skipped++; continue }
      let result = { outcome: 'sent', error_code: null }
      if (!allowedEndpoint(message.subscription.endpoint)) result = { outcome: 'failed', error_code: 'INVALID_ENDPOINT' }
      else {
        try {
          await send(message.subscription, JSON.stringify({ title: message.title, body: message.body,
            url: message.concertId ? `/?page=discover&event=${encodeURIComponent(message.concertId)}` : '/', tag: message.tag }),
          { TTL: message.ttl, timeout: 10000, topic: row.id.replaceAll('-', '').slice(0, 32) })
        } catch (error) { result = pushOutcome(error) }
      }
      await rpc('finish_notification', { ...identity, ...result })
      counts[result.outcome]++
    }
  }
  // Wait for every in-flight send to finish even if another RPC failed.
  const outcomes = await Promise.allSettled(Array.from({ length: concurrency }, consume))
  const failed = outcomes.find(outcome => outcome.status === 'rejected')
  if (failed) throw failed.reason
  return counts
}
