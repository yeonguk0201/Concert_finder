// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { dispatchNotifications } from '../_shared/notification-dispatch.mjs'
import { createNotificationHandler } from '../_shared/notification-http.mjs'
import { createPushSender } from '../_shared/notification-transport.mjs'

const dispatch = async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const
  const values = names.map(name => Deno.env.get(name)?.trim())
  if (values.some(value => !value)) throw new Error('WORKER_NOT_CONFIGURED')
  const [url, serviceKey, publicKey, privateKey, subject] = values as string[]
  webpush.setVapidDetails(subject, publicKey, privateKey)
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000))
    if (error) throw new Error('WORKER_RPC_FAILED')
    return data
  }
  // One batch (at most 10 deliveries); the next cron invocation drains the rest.
  return await dispatchNotifications({ rpc, send: createPushSender(webpush), concurrency: 2 })
}

Deno.serve(createNotificationHandler({ secret: Deno.env.get('NOTIFICATION_CRON_SECRET'), dispatch }))
