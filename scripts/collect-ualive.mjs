import { createClient } from '@supabase/supabase-js'
import { collect } from './ualive.mjs'

const upload = process.argv.includes('--upload')
try {
  if (upload && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Server environment for candidate upload is missing')
  const result = await collect()
  if (upload) {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await client.rpc('admin_ingest_ualive', { batch: result })
    if (error) throw new Error('Candidate upload failed; check administrator session and migration')
  }
  console.log(JSON.stringify({ ...result, uploaded: upload }, null, 2))
  if (result.failures.length) process.exitCode = 1
} catch (error) { console.error(error.message); process.exitCode = 1 }
