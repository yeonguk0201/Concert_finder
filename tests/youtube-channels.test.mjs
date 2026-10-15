import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelTarget, refreshManifest } from '../scripts/youtube-channels.mjs'
const now=Date.parse('2026-10-15T01:00:00Z'), DAY=86400000
const cid='UC'+'a'.repeat(22), other='UC'+'b'.repeat(22)
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const row=(n=1,url=`https://www.youtube.com/channel/${cid}`)=>({bandId:uuid(n),musicBrainzId:uuid(n+100),name:'Artist '+n,curationStatus:'unreviewed',identityVersion:'v1',channelUrl:url,verification:'verified',evidence:[{kind:'official_artist_page',url:'https://official.example.com/artist/'+n,linkedChannelUrl:url,identityMatched:true,checkedAt:'2026-10-14T01:00:00Z'}]})
const item=(id=cid)=>({id,snippet:{title:'Artist Channel',thumbnails:{medium:{url:'https://yt3.googleusercontent.com/example=s240',width:240,height:240}}}})
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
test('channel URLs accept IDs and Unicode handles but never video links or lookalike hosts',()=>{
  assert.deepEqual(channelTarget(`https://www.youtube.com/channel/${cid}`),{kind:'id',value:cid})
  assert.deepEqual(channelTarget('https://youtube.com/@%E3%82%A2%E3%83%89'),{kind:'forHandle',value:'@アド'})
  for(const url of ['https://youtube.com.evil.com/@Artist','https://youtube.com/watch?v=abc','https://youtu.be/abc','https://music.youtube.com/browse/abc','http://youtube.com/@Artist','https://user@youtube.com/@Artist','https://youtube.com/c/Artist']) assert.equal(channelTarget(url),null)
})
test('different artists are batched; successful API retrieval does not prove official status',async()=>{
  const a=row(),b={...row(2,`https://youtube.com/channel/${other}`),verification:'candidate',evidence:[]}
  let calls=0
  const report=await refreshManifest({version:1,artists:[a,b]},{now,key:'private-key',fetcher:async url=>{calls++;assert.equal(new URL(url).hostname,'www.googleapis.com');assert.equal(new URL(url).searchParams.get('id'),`${cid},${other}`);return json({items:[item(),item(other)]})}})
  assert.equal(calls,1);assert.equal(report.apiCalls,1)
  assert.equal(report.artists[0].displayable,true)
  assert.equal(report.artists[1].status,'candidate');assert.equal(report.artists[1].displayable,false)
  assert.ok(!JSON.stringify(report).includes('private-key'))
  assert.equal(report.artists[0].cache.thumbnails.medium.url,'https://yt3.googleusercontent.com/example=s240')
})
test('hundreds of known channel IDs use batches of at most 50 without per-name searches',async()=>{
  const artists=Array.from({length:121},(_,index)=>row(index+1,`https://youtube.com/channel/UC${String(index).padStart(22,'0')}`))
  let calls=0
  const report=await refreshManifest({version:1,artists},{now,key:'key',fetcher:async url=>{calls++;const ids=new URL(url).searchParams.get('id').split(',');assert.ok(ids.length<=50);return json({items:ids.map(id=>item(id))})}})
  assert.equal(calls,3);assert.equal(report.counts.refreshed,121)
  assert.ok(report.artists.every(row=>row.displayable))
})
test('missing keys, excluded artists, locked handles and incomplete proof are explicit and non-mutating',async()=>{
  const a=row(),b={...row(2),curationStatus:'excluded'},c={...row(3,'https://youtube.com/@Artist'),locked:true,previousChannelId:cid}
  const report=await refreshManifest({version:1,artists:[a,b,c]},{now,fetcher:()=>{throw new Error('must not call')}})
  assert.equal(report.apiCalls,0);assert.equal(report.applied,false)
  assert.deepEqual(report.artists.map(a=>a.status),['key_required','skipped','needs_review'])
  assert.equal(report.artists[1].cache,null)
})
test('a redirected handle or shared label channel never silently replaces or links identities',async()=>{
  const a={...row(1,'https://youtube.com/@Artist'),previousChannelId:cid}
  const redirected=await refreshManifest({version:1,artists:[a]},{now,key:'key',fetcher:async()=>json({items:[item(other)]})})
  assert.equal(redirected.artists[0].reason,'CHANNEL_ID_CHANGED');assert.equal(redirected.artists[0].cache,null)
  const snapshots=[]
  const shared=await refreshManifest({version:1,artists:[row(),row(2)]},{now,key:'key',fetcher:async()=>json({items:[item()]}),onCheckpoint:async output=>snapshots.push(structuredClone(output))})
  assert.ok(shared.artists.every(a=>a.reason==='CHANNEL_SHARED_ACROSS_IDENTITIES'&&!a.displayable))
  assert.ok(snapshots.every(s=>s.artists.every(a=>!a.displayable)))
  const narrowed=await refreshManifest({version:1,artists:[row()]},{now:now+DAY,previous:shared,key:'key',fetcher:()=>{throw new Error('must not retry resolved collision without new evidence')}})
  assert.equal(narrowed.artists[0].reason,'CHANNEL_SHARED_ACROSS_IDENTITIES');assert.equal(narrowed.apiCalls,0)
})
test('fresh cache avoids API work; changes require new resolution; expiration purges API-derived data',async()=>{
  const input={version:1,artists:[row()]}
  const previous=await refreshManifest(input,{now,key:'key',fetcher:async()=>json({items:[item()]})})
  const reused=await refreshManifest(input,{now:now+DAY,previous,fetcher:()=>{throw new Error('must not call')}})
  assert.equal(reused.artists[0].status,'reused');assert.equal(reused.apiCalls,0)
  assert.equal(reused.artists[0].cache.checkedAt,new Date(now).toISOString())
  const changed=await refreshManifest({version:1,artists:[{...row(),identityVersion:'v2'}]},{now:now+DAY,previous})
  assert.equal(changed.artists[0].cache,null)
  const expired=await refreshManifest(input,{now:now+30*DAY,previous})
  assert.equal(expired.artists[0].cache,null);assert.equal(expired.artists[0].displayable,false)
  const stale=await refreshManifest(input,{now:now+8*DAY,previous})
  assert.equal(stale.artists[0].status,'key_required');assert.equal(stale.artists[0].displayable,true)
  assert.equal(stale.artists[0].cache.checkedAt,new Date(now).toISOString())
})
test('handle refresh remembers the previous resolved ID even if the caller omitted previousChannelId',async()=>{
  const input={version:1,artists:[row(1,'https://youtube.com/@Artist')]}
  const previous=await refreshManifest(input,{now,key:'key',fetcher:async()=>json({items:[item()]})})
  const changed=await refreshManifest(input,{now:now+8*DAY,previous,key:'key',fetcher:async()=>json({items:[item(other)]})})
  assert.equal(changed.artists[0].reason,'CHANNEL_ID_CHANGED');assert.equal(changed.artists[0].displayable,false)
})
test('quotas stop subsequent requests and transient failures retry a bounded number of times',async()=>{
  const artists=[row(1,'https://youtube.com/@Artist1'),row(2,'https://youtube.com/@Artist2')]
  let calls=0
  const quota=await refreshManifest({version:1,artists},{now,key:'key',fetcher:async()=>{calls++;return new Response('',{status:403})}})
  assert.equal(calls,1);assert.deepEqual(quota.artists.map(a=>a.status),['failed','deferred'])
  calls=0
  const recovered=await refreshManifest({version:1,artists:[row()]},{now,key:'key',pause:async()=>{},fetcher:async()=>++calls<3?new Response('',{status:503}):json({items:[item()]})})
  assert.equal(calls,3);assert.equal(recovered.artists[0].status,'refreshed')
})
test('unsafe thumbnail hosts are never exposed and malformed or duplicate manifest entries reject before requests',async()=>{
  const bad=item();bad.snippet.thumbnails.medium.url='https://evil.example.com/photo.jpg'
  const report=await refreshManifest({version:1,artists:[row()]},{now,key:'key',fetcher:async()=>json({items:[bad]})})
  assert.equal(report.artists[0].displayable,false);assert.equal(report.artists[0].reason,'PHOTO_UNAVAILABLE')
  await assert.rejects(refreshManifest({version:1,artists:[row(),row()]},{now}),/MANIFEST_DUPLICATE_BAND/)
  await assert.rejects(refreshManifest({version:1,artists:[{...row(),bandId:'bad'}]},{now}),/MANIFEST_ARTIST_INVALID/)
})
