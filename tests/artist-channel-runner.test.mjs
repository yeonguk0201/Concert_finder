import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runRefresh } from '../scripts/refresh-artist-channels.mjs'
const now=Date.parse('2026-10-15T12:00:00Z'), id='UC'+'a'.repeat(22)
const row={bandId:'00000000-0000-4000-8000-000000000001',musicBrainzId:'00000000-0000-4000-8000-000000000002',name:'Artist',curationStatus:'approved',identityVersion:'2026-10-15T00:00:00Z',profileVersion:'2026-10-15T00:00:00Z',channelUrl:`https://www.youtube.com/channel/${id}`,verification:'verified',evidence:[{kind:'official_artist_page',url:'https://official.example.com',linkedChannelUrl:`https://www.youtube.com/channel/${id}`,identityMatched:true,checkedAt:'2026-10-14T00:00:00Z'}]}
const manifest={version:1,artists:[row]}
function client(data=manifest,fail='') {
  const calls=[]
  return { calls, rpc:async (name,args)=>{calls.push({name,args});return name==='service_artist_channel_manifest'?{data}:{error:fail?{message:fail}:null}} }
}
test('scheduler writes fresh metadata with original versions and emits only counts',async()=>{
  const db=client()
  const result=await runRefresh(db,{key:'secret',now,fetcher:async()=>new Response(JSON.stringify({items:[{id,snippet:{title:'Private API title',thumbnails:{high:{url:'https://yt3.googleusercontent.com/avatar'}}}}]}))})
  assert.equal(result.ok,true); assert.equal(result.applied,1); assert.equal(result.apiCalls,1)
  const write=db.calls.find(c=>c.name==='service_apply_artist_channel').args
  assert.equal(write.expected_profile_updated_at,row.profileVersion); assert.equal(write.result.identityVersion,row.identityVersion)
  assert.ok(!JSON.stringify(result).includes('Private API title')); assert.ok(!JSON.stringify(result).includes('googleusercontent'))
})
test('missing API key still performs expiry sweep and records a failed run without advancing success timestamps',async()=>{
  const db=client()
  const result=await runRefresh(db,{now,fetcher:()=>{throw new Error('must not fetch')}})
  assert.equal(db.calls[0].name,'service_artist_channel_manifest'); assert.equal(result.ok,false)
  assert.equal(result.counts.key_required,1); assert.equal(result.apiCalls,0)
  assert.equal(db.calls[1].args.result.cache,null)
})
test('database conflicts are sanitized, surfaced and not retried as successful applications',async()=>{
  const db=client(manifest,'EDIT_CONFLICT')
  const result=await runRefresh(db,{now})
  assert.equal(result.writeFailures,1); assert.equal(result.applied,0); assert.equal(result.errors.EDIT_CONFLICT,1)
  assert.equal(db.calls.filter(c=>c.name==='service_apply_artist_channel').length,1)
})
test('reviewed bulk manifests are identity fenced and malformed input causes no writes',async()=>{
  const db=client({version:1,artists:[]})
  await assert.rejects(runRefresh(db,{now,manifest:{version:1,artists:[{...row,bandId:'invalid'}]}}),/MANIFEST_ARTIST_INVALID/)
  assert.equal(db.calls.length,0)
  const report=await runRefresh(db,{now,manifest})
  assert.equal(report.imported,1)
  assert.equal(db.calls[0].args.expected_band_updated_at,row.identityVersion)
  assert.equal(db.calls[0].args.expected_updated_at,row.profileVersion)
})
