import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

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
export async function dispatchNotifications({ rpc, send }) {
  const batch = await rpc('claim_notification_batch', {})
  const counts = { claimed: batch.length, sent: 0, skipped: 0, retry: 0, failed: 0, invalid_device: 0 }
  for (const row of batch) {
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
  return counts
}

async function main() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
  if (required.some(name => !process.env[name])) throw new Error('Missing worker configuration')
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error(`Worker RPC failed: ${name}`)
    return data
  }
  // Bounded draining; the next scheduled run processes remaining batches.
  for (let i = 0; i < 10; i++) {
    const counts = await dispatchNotifications({ rpc, send: (...args) => webpush.sendNotification(...args) })
    console.log(JSON.stringify(counts)) // Never log endpoint/key/payload/user IDs.
    if (counts.claimed < 50) break
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Notification worker failed. Check configuration and private delivery records.'); process.exitCode = 1 })
}
