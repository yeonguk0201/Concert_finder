import { createClient } from '@supabase/supabase-js'
// An independent probe can detect absent schedules, not just failed invocations.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server environment missing')
const client = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const { data, error } = await client.from('collection_runs').select('source,state,finished_at,created_at').neq('state','legacy').order('created_at',{ascending:false}).limit(200)
if (error) throw new Error(`Health probe failed: ${error.code}`)
for (const source of ['ualive','mintpaper','radwimps','yes24']) {
  const rows=data.filter(row=>row.source===source)
  const success=rows.find(row=>row.state==='success')
  const attention=!success || Date.now()-Date.parse(success.finished_at)>7200000 || (rows.length>=2 && rows.slice(0,2).every(row=>['failed','expired','partial'].includes(row.state)))
  console.log(JSON.stringify({source,last_success:success?.finished_at??null,attention_required:attention}))
  if (attention) process.exitCode=1
}
