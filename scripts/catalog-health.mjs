import { createClient } from '@supabase/supabase-js'
// An independent probe can detect absent schedules, not just failed invocations.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server environment missing')
const client = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const [{ data, error }, policies] = await Promise.all([
  client.from('collection_runs').select('source,state,finished_at,created_at').neq('state','legacy').order('created_at',{ascending:false}).limit(200),
  client.from('collection_policies').select('source,collection_enabled'),
])
if (error) throw new Error(`Health probe failed: ${error.code}`)
if (policies.error) throw new Error(`Policy probe failed: ${policies.error.code}`)
for (const {source,collection_enabled:enabled} of policies.data) {
  const rows=data.filter(row=>row.source===source)
  const success=rows.find(row=>row.state==='success')
  const attention=enabled && (!success || Date.now()-Date.parse(success.finished_at)>7200000 || (rows.length>=2 && rows.slice(0,2).every(row=>['failed','expired','partial'].includes(row.state))))
  console.log(JSON.stringify({source,last_success:success?.finished_at??null,attention_required:attention}))
  if (attention) process.exitCode=1
}
