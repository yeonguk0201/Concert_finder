import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
const manifest=JSON.parse(await readFile(new URL('../supabase/manual/starter-artists.json',import.meta.url),'utf8'))
const upload=process.argv.includes('--upload')
if (upload && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Server environment missing')
const client=upload ? createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}) : null
for (const identity of manifest.identities) {
  if (!client) { console.log(JSON.stringify({name:identity.name,key:identity.key,upload:false})); continue }
  const {data,error}=await client.rpc('service_seed_artist',{identity})
  if (error) { console.error(JSON.stringify({name:identity.name,error:error.code})); process.exitCode=1; continue }
  console.log(JSON.stringify({name:identity.name,band_id:data,status:data?'registered_or_reused':'identity_conflict_review'}))
  if (!data) process.exitCode=1
}
