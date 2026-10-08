import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

import { dispatchNotifications } from '../supabase/functions/_shared/notification-dispatch.mjs'
export { allowedEndpoint, pushOutcome, dispatchNotifications } from '../supabase/functions/_shared/notification-dispatch.mjs'

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
  const started = Date.now()
  for (let i = 0; i < 10 && Date.now() - started < 8 * 60_000; i++) {
    const counts = await dispatchNotifications({ rpc, send: (...args) => webpush.sendNotification(...args) })
    console.log(JSON.stringify(counts)) // Never log endpoint/key/payload/user IDs.
    if (counts.claimed < 10) break
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Notification worker failed. Check configuration and private delivery records.'); process.exitCode = 1 })
}
