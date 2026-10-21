import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

// Invoke from an independent host to detect a missing collection scheduler.
export async function probeCatalog(client, now = Date.now()) {
  const policies = await client.from('collection_policies').select('source,collection_enabled')
  if (policies.error) throw new Error(`Policy probe failed: ${policies.error.code}`)
  return Promise.all(policies.data.map(async ({ source, collection_enabled: enabled }) => {
    // Query each source separately: a busy source must not displace another's
    // last success from a shared limited result set. Ingestion also writes legacy rows.
    const [recent, success] = await Promise.all([
      client.from('collection_runs').select('state,started_at,finished_at,created_at')
        .eq('source', source).neq('state', 'legacy').order('created_at', { ascending: false }).limit(2),
      client.from('collection_runs').select('finished_at').eq('source', source).eq('state', 'success')
        .order('finished_at', { ascending: false, nullsFirst: false }).limit(1),
    ])
    if (recent.error || success.error) throw new Error(`Health probe failed: ${(recent.error ?? success.error).code}`)
    const lastSuccess = success.data[0]?.finished_at ?? null
    const lastStarted = recent.data[0]?.started_at ?? null
    const successAge = now - Date.parse(lastSuccess)
    const startAge = now - Date.parse(lastStarted)
    const overdue = enabled && (!Number.isFinite(startAge) || startAge > 3600000)
    const failedTwice = recent.data.length === 2 && recent.data.every(row => ['failed', 'expired', 'partial'].includes(row.state))
    return {
      source, collection_enabled: enabled, last_started: lastStarted, last_success: lastSuccess,
      collection_overdue: overdue,
      attention_required: enabled && (overdue || !Number.isFinite(successAge) || successAge > 7200000 || failedTwice),
    }
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server environment missing')
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const row of await probeCatalog(client)) {
      console.log(JSON.stringify(row))
      if (row.attention_required) process.exitCode = 1
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
