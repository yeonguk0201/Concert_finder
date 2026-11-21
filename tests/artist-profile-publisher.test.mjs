import {test} from 'node:test'
import assert from 'node:assert/strict'
import {prepareProfile,evidenceUrl} from '../scripts/publish-artist-profile.mjs'
const mbid='4561aee5-6cf6-41a6-9b7b-f7be15a00a65',bandId='dcb90080-9164-478b-a728-b0f0172e2db0',channelId='UC3Ea2-Ut3navgOlTfoq790g',videoId='kq4GcIzcwXc'
function fixture({mismatch=false,official=true,held=false}={}) {
 const event={status:'candidate',bandId,musicBrainzId:mbid,sources:[{url:'https://ko.wikipedia.org/wiki/Artist?oldid=1',revision:1,authorsUrl:'https://ko.wikipedia.org/wiki/Artist?action=history',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'}],candidate:{bio:'아티스트 신원 확인 후 작성한 한국어 소개.',language:'ko',sourceRevision:1,banner:{status:'candidate',useScope:'editorial_preview_only',imageUrl:'https://shorefire.com/image.jpg'},videos:[{videoId,channelId,status:held?'held':'candidate',kind:'music',title:'33',publisher:'Publisher',officialityBasis:'MusicBrainz official channel relationship.'}]}}
 const calls=[]
 const fetcher=async(url,options)=>{calls.push({url,options});let data
 if(url.includes('musicbrainz.org/ws/')) data={relations:[{type:'wikidata',url:{resource:'https://www.wikidata.org/wiki/Q1'}},...(official?[{type:'youtube',url:{resource:`https://www.youtube.com/channel/${channelId}`}}]:[])]}
 else if(url.includes('wikidata.org')) data={entities:{Q1:{claims:{P434:[{mainsnak:{datavalue:{value:mismatch?'other':mbid}}}]},sitelinks:{kowiki:{title:'Artist'}}}}}
 else if(url.includes('wikipedia.org/w/api'))data={query:{pages:{1:{title:'Artist',revisions:[{revid:1}]}}}}
 else if(url.includes('googleapis.com'))data={items:[{id:videoId,snippet:{channelId},status:{privacyStatus:'public'}}]}
 else throw Error('UNEXPECTED_REQUEST')
 return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})
 }
 return{event,fetcher,calls}
}
test('production payload revalidates identity/revision/uploader, excludes editorial illustrations and has no channel writer',async()=>{
 const f=fixture();const p=await prepareProfile(f.event,{fetcher:f.fetcher,key:'test'})
 assert.equal(p.banner,undefined);assert.equal(p.music[0].id,videoId);assert.equal(p.bioSource.revision,1)
 assert.equal(f.calls.filter(c=>c.url.includes('googleapis')).length,1)
 assert.ok(f.calls.every(c=>c.options.redirect==='error' && c.options.signal))
 assert.ok(f.calls.every(c=>!c.url.includes('test') && !c.url.includes('shorefire')))
 assert.equal(f.calls.find(c=>c.url.includes('googleapis')).options.headers['X-Goog-Api-Key'],'test')
})
test('identity mismatch blocks all publication; held and unproven channels never become visible videos',async()=>{
 const wrong=fixture({mismatch:true});await assert.rejects(prepareProfile(wrong.event,{fetcher:wrong.fetcher,key:'test'}),/PROFILE_IDENTITY_REQUIRED/)
 for(const changes of [{official:false},{held:true}]){const f=fixture(changes);assert.equal((await prepareProfile(f.event,{fetcher:f.fetcher,key:'test'})).music.length,0)}
})
test('source URL validation rejects private addresses, credentials and key-bearing URLs',()=>{
 for(const url of ['http://example.com/','https://127.0.0.1/a','https://[::1]/','https://example.local/a','https://x.supabase.co/rest/v1/bands','https://user:pass@example.com/','https://example.com/?key=secret'])assert.equal(evidenceUrl(url),false,url)
 assert.equal(evidenceUrl('https://www.universal-music.co.jp/ado/'),true)
})

test('uncertain apply recovers from exact state and a retry verifies public visibility without a second write',async()=>{
 const {publishCandidate}=await import('../scripts/publish-artist-profile.mjs')
 const {gzipSync}=await import('node:zlib')
 const f=fixture();const runId='5054d095-437d-429f-8f33-7599d85b6bc3',version=new Date().toISOString()
 const event={...f.event,schemaVersion:1,runId,attempt:1,sourceVersion:version,checkedAt:version,retry:{count:0,nextAt:null},application:{status:'not_attempted'},sources:f.event.sources.map(s=>({...s,checkedAt:version,useBasis:'Wikipedia revision and attribution'}))}
 let state=null,writes=0
 const client={storage:{getBucket:async()=>({data:{id:'concert-scheduler-state',public:false}}),from:()=>({download:async()=>({data:new Blob([gzipSync(Buffer.from(JSON.stringify(event)))])})})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:bandId,musicbrainz_id:mbid,updated_at:version,curation_status:'approved'}})})})}),rpc:async(name,args)=>{
  if(name==='service_artist_profile_state')return{data:state}
  assert.equal(name,'service_apply_artist_profile');writes++
  state={source_key:args.candidate_key,content:args.payload,updated_at:version,locked:false}
  return{error:{message:'transport reply lost'}}
 }}
 const pub={rpc:async()=>({data:state?.content})},locator={runId,bandId,attempt:1}
 assert.equal((await publishCandidate(client,pub,locator,{fetcher:f.fetcher,key:'test'})).status,'recovered')
 assert.equal((await publishCandidate(client,pub,locator,{fetcher:()=>{throw Error('REVERIFIED')},key:'test'})).status,'already_applied')
 assert.equal(writes,1)
 state.locked=true
 await assert.rejects(publishCandidate(client,pub,locator),/PROFILE_MANUAL_LOCK/)
 assert.equal(writes,1)
})

test('Commons tracking parameters are removed without broadening image hosts or licenses',async()=>{
 const f=fixture({held:true});f.event.candidate.banner={status:'candidate',url:'https://commons.wikimedia.org/wiki/File:Example.jpg'}
 const fetcher=(u,o)=>u.startsWith('https://commons.wikimedia.org/')?Promise.resolve(new Response(JSON.stringify({query:{pages:{1:{imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/example.jpg?utm_source=commons.wikimedia.org',extmetadata:{Artist:{value:'Author'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0'},LicenseShortName:{value:'CC BY 4.0'}}}]}}}}))):f.fetcher(u,o)
 const p=await prepareProfile(f.event,{fetcher,key:'test'})
 assert.equal(p.banner.url,'https://upload.wikimedia.org/wikipedia/commons/example.jpg')
 assert.equal(p.banner.useScope,'production_commons')
})
