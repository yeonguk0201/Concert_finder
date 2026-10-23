import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DAY=86400000, UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/
const sleep=ms=>new Promise(done=>setTimeout(done,ms))
export function channelTarget(value) {
  try {
    const url=new URL(value)
    if (url.protocol!=='https:' || url.username || url.password || url.port || !['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) return null
    const path=decodeURIComponent(url.pathname).replace(/\/$/,'')
    if (path.startsWith('/channel/') && CHANNEL.test(path.slice(9))) return {kind:'id',value:path.slice(9)}
    if (/^\/@[^/\s?#]{1,100}$/u.test(path)) return {kind:'forHandle',value:path.slice(1)}
    if (/^\/user\/[A-Za-z0-9._-]{1,100}$/.test(path)) return {kind:'forUsername',value:path.slice(6)}
  } catch { /* Untrusted links are candidates, never requests to arbitrary hosts. */ }
  return null
}
const age=(value,now)=>now-Date.parse(value)
const recent=(value,days,now)=>Number.isFinite(age(value,now)) && age(value,now)>=0 && age(value,now)<days*DAY
const equivalent=(a,b)=>a?.kind===b?.kind && a?.value===b?.value
function secureUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && !['localhost'].includes(u.hostname) && /\.[a-z]{2,}$/i.test(u.hostname)} catch{return false}
}
export function officialEvidence(row,now) {
  return row.verification==='verified' && row.evidence.some(e=>e.kind==='official_artist_page' && e.identityMatched===true
    && secureUrl(e.url) && recent(e.checkedAt,90,now) && equivalent(channelTarget(e.linkedChannelUrl),channelTarget(row.channelUrl)))
}
function pickRow(row) {
  if (!UUID.test(row?.bandId??'') || !UUID.test(row?.musicBrainzId??'') || typeof row.name!=='string' || !row.name.trim()
    || typeof row.identityVersion!=='string' || !row.identityVersion || typeof row.channelUrl!=='string'
    || !['approved','unreviewed','held','excluded'].includes(row.curationStatus)
    || !['verified','candidate','needs_review'].includes(row.verification) || !Array.isArray(row.evidence)
    || row.evidence.some(e=>!e || typeof e!=='object')) throw new Error('MANIFEST_ARTIST_INVALID')
  return {bandId:row.bandId,musicBrainzId:row.musicBrainzId,name:row.name,identityVersion:row.identityVersion,curationStatus:row.curationStatus,
    channelUrl:row.channelUrl,verification:row.verification,evidence:row.evidence.map(e=>({kind:e.kind,url:e.url,linkedChannelUrl:e.linkedChannelUrl,identityMatched:e.identityMatched===true,checkedAt:e.checkedAt})),
    previousChannelId:CHANNEL.test(row.previousChannelId??'')?row.previousChannelId:null,locked:row.locked===true}
}
const fingerprint=row=>JSON.stringify([row.musicBrainzId,row.identityVersion,row.channelUrl,row.verification,
  row.evidence.map(e=>[e.kind,e.url,e.linkedChannelUrl,e.identityMatched===true,e.checkedAt]),row.previousChannelId,row.locked])
function markSharedChannels(artists) {
  const channels=new Map()
  for(const row of artists)if(row.cache){const id=row.cache.channelId;if(!channels.has(id))channels.set(id,[]);channels.get(id).push(row)}
  for(const group of channels.values())if(new Set(group.map(row=>row.musicBrainzId)).size>1)for(const row of group){row.status='needs_review';row.reason='CHANNEL_SHARED_ACROSS_IDENTITIES';row.displayable=false}
}
function thumbnails(raw) {
  const result={}
  for (const size of ['default','medium','high']) {
    const value=raw?.[size]
    if (!secureUrl(value?.url)) continue
    const host=new URL(value.url).hostname
    if (!['ggpht.com','googleusercontent.com','ytimg.com'].some(domain=>host===domain || host.endsWith(`.${domain}`))) continue
    result[size]={url:value.url,...(Number.isInteger(value.width)&&value.width>0?{width:value.width}:{}),...(Number.isInteger(value.height)&&value.height>0?{height:value.height}:{})}
  }
  return result
}
async function requestChannels(params,key,{fetcher,pause,onCall}) {
  const query=new URLSearchParams({part:'snippet',...params,key})
  for(let attempt=0;attempt<3;attempt++) {
    let response
    onCall()
    try {response=await fetcher(`https://www.googleapis.com/youtube/v3/channels?${query}`,{redirect:'error',signal:AbortSignal.timeout(15000)})}
    catch {if(attempt<2){await pause((attempt+1)*1000);continue}throw new Error('YOUTUBE_NETWORK_FAILED')}
    if([400,401,403,429].includes(response.status)) throw new Error(`YOUTUBE_STOP_${response.status}`)
    if(response.status>=500 && attempt<2){await pause((attempt+1)*1000);continue}
    if(!response.ok)throw new Error('YOUTUBE_PROVIDER_FAILED')
    // Bounded JSON read; never log Google errors (request URLs can include the key).
    const reader=response.body?.getReader()
    if(!reader)throw new Error('YOUTUBE_INVALID_RESPONSE')
    const chunks=[];let size=0
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw new Error('YOUTUBE_RESPONSE_TOO_LARGE');chunks.push(value)}} finally {await reader.cancel()}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    let data
    try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new Error('YOUTUBE_INVALID_RESPONSE')}
    if(!Array.isArray(data.items) || data.items.some(item=>!CHANNEL.test(item?.id??'') || typeof item.snippet?.title!=='string'))throw new Error('YOUTUBE_INVALID_RESPONSE')
    return data.items
  }
}
export async function refreshManifest(manifest,{previous=null,key='',fetcher=fetch,pause=sleep,now=Date.now(),limit=10000,onCheckpoint=async()=>{}}={}) {
  if(manifest?.version!==1 || !Array.isArray(manifest.artists) || !Number.isFinite(now) || !Number.isInteger(limit) || limit<1 || limit>10000)throw new Error('MANIFEST_INVALID')
  const ids=new Set(),rows=manifest.artists.map(pickRow)
  for(const row of rows){if(ids.has(row.bandId))throw new Error('MANIFEST_DUPLICATE_BAND');ids.add(row.bandId)}
  const old=new Map((previous?.artists??[]).map(row=>[row.bandId,row]))
  const output={version:1,policy:'official-channel-evidence-v1',checkedAt:new Date(now).toISOString(),apiCalls:0,artists:[],applied:false}
  const jobs=[]
  for(const [index,row] of rows.entries()) {
    const prior=old.get(row.bandId)
    const same=prior && fingerprint(row)===fingerprint(prior)
    const target=channelTarget(row.channelUrl)
    const cached=prior?.cache
    const validCache=same && cached && CHANNEL.test(cached.channelId??'') && typeof cached.title==='string' && recent(cached.checkedAt,30,now)
      && (!row.previousChannelId || row.previousChannelId===cached.channelId) && (target?.kind!=='id' || target.value===cached.channelId)
    const cache=validCache?{channelId:cached.channelId,title:cached.title,channelUrl:`https://www.youtube.com/channel/${cached.channelId}`,thumbnails:thumbnails(cached.thumbnails),checkedAt:cached.checkedAt,refreshDueAt:new Date(Date.parse(cached.checkedAt)+7*DAY).toISOString(),expiresAt:new Date(Date.parse(cached.checkedAt)+30*DAY).toISOString()}:null
    const result={...row,status:'pending',reason:'',displayable:false,cache,applied:false}
    output.artists.push(result)
    if(['held','excluded'].includes(row.curationStatus)){result.status='skipped';result.reason='ARTIST_CURATION_BLOCKED';result.cache=null;continue}
    if(!target){result.status='needs_review';result.reason='CHANNEL_LINK_UNSUPPORTED';result.cache=null;continue}
    if(row.locked && (!row.previousChannelId || target.kind!=='id' || target.value!==row.previousChannelId)){result.status='needs_review';result.reason='LOCKED_ID_REQUIRED';result.cache=null;continue}
    if(same && prior.status==='needs_review' && ['CHANNEL_SHARED_ACROSS_IDENTITIES','CHANNEL_ID_CHANGED','CHANNEL_AMBIGUOUS'].includes(prior.reason)){
      result.status='needs_review';result.reason=prior.reason;result.cache=null;continue
    }
    const verified=officialEvidence(row,now)
    if(!verified)result.reason='OFFICIAL_EVIDENCE_REQUIRED'
    if(verified && validCache && recent(prior.cache.checkedAt,7,now)) {
      result.status='reused';result.displayable=Object.keys(result.cache.thumbnails??{}).length>0;continue
    }
    if(index>=limit){result.status='deferred';result.reason='RUN_LIMIT';continue}
    if(!key){result.status='key_required';result.reason='YOUTUBE_API_KEY_REQUIRED';continue}
    jobs.push({target,result,verified})
  }
  const batches=[]
  const idJobs=jobs.filter(j=>j.target.kind==='id')
  const uniqueIds=[...new Set(idJobs.map(j=>j.target.value))]
  for(let index=0;index<uniqueIds.length;index+=50){const values=uniqueIds.slice(index,index+50);batches.push({params:{id:values.join(',')},jobs:idJobs.filter(j=>values.includes(j.target.value))})}
  const handles=new Map()
  for(const job of jobs.filter(j=>j.target.kind!=='id')){const k=JSON.stringify(job.target);if(!handles.has(k))handles.set(k,[]);handles.get(k).push(job)}
  for(const group of handles.values())batches.push({params:{[group[0].target.kind]:group[0].target.value},jobs:group})
  let stopped=false,consecutiveFailures=0
  for(const batch of batches) {
    if(stopped){for(const job of batch.jobs){job.result.status='deferred';job.result.reason='PROVIDER_STOPPED'}continue}
    try {
      const items=await requestChannels(batch.params,key,{fetcher,pause,onCall:()=>output.apiCalls++})
      consecutiveFailures=0
      for(const {target,result,verified} of batch.jobs) {
        const matches=target.kind==='id'?items.filter(item=>item.id===target.value):items
        if(matches.length!==1){result.status=matches.length?'needs_review':'unavailable';result.reason=matches.length?'CHANNEL_AMBIGUOUS':'CHANNEL_NOT_FOUND';result.cache=null;continue}
        const item=matches[0]
        const prior=old.get(result.bandId)
        const expectedId=result.previousChannelId ?? (prior?.musicBrainzId===result.musicBrainzId && prior.channelUrl===result.channelUrl && CHANNEL.test(prior.cache?.channelId??'')?prior.cache.channelId:null)
        if(expectedId && expectedId!==item.id){result.status='needs_review';result.reason='CHANNEL_ID_CHANGED';result.cache=null;continue}
        // Different bands sharing a channel can mean a label/fan channel. Review both.
        result.cache={channelId:item.id,title:item.snippet.title,channelUrl:`https://www.youtube.com/channel/${item.id}`,thumbnails:thumbnails(item.snippet.thumbnails),checkedAt:new Date(now).toISOString(),refreshDueAt:new Date(now+7*DAY).toISOString(),expiresAt:new Date(now+30*DAY).toISOString()}
        result.status=verified?'refreshed':'candidate';result.reason=verified?'':'OFFICIAL_EVIDENCE_REQUIRED';result.displayable=verified && Object.keys(result.cache.thumbnails).length>0
        if(verified && !result.displayable)result.reason='PHOTO_UNAVAILABLE'
      }
    } catch(error) {
      const code=/^YOUTUBE_[A-Z0-9_]+$/.test(error.message)?error.message:'YOUTUBE_PROVIDER_FAILED'
      consecutiveFailures++
      stopped=code.startsWith('YOUTUBE_STOP_') || consecutiveFailures>=3
      for(const {result,verified} of batch.jobs){result.status='failed';result.reason=code;result.displayable=Boolean(verified && result.cache && Object.keys(result.cache.thumbnails??{}).length)}
    }
    markSharedChannels(output.artists)
    await onCheckpoint(output)
  }
  // Limit, missing-key and stopped-provider rows may retain a valid cache but never
  // get a new checkedAt. They remain visible only with still-valid official proof.
  for(const row of output.artists)if(['deferred','key_required'].includes(row.status))row.displayable=Boolean(officialEvidence(row,now)&&row.cache&&Object.keys(row.cache.thumbnails??{}).length)
  markSharedChannels(output.artists)
  output.counts=Object.fromEntries([...new Set(output.artists.map(row=>row.status))].map(status=>[status,output.artists.filter(row=>row.status===status).length]))
  await onCheckpoint(output)
  return output
}
async function save(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n','utf8');await rename(`${path}.tmp`,path)}
export async function main(args=process.argv.slice(2),env=process.env) {
  if(args.some(arg=>!/^--(input|output|previous|limit)=/.test(arg)))throw new Error('ARGUMENT_INVALID')
  const option=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
  const input=resolve(option('input','.local/artist-channels/input.json')),output=resolve(option('output','.local/artist-channels/latest.json'))
  if(input===output)throw new Error('OUTPUT_MUST_DIFFER_FROM_INPUT')
  const manifest=JSON.parse(await readFile(input,'utf8'))
  const previousPath=option('previous','')
  const previous=previousPath?JSON.parse(await readFile(resolve(previousPath),'utf8')):null
  const report=await refreshManifest(manifest,{previous,key:env.YOUTUBE_API_KEY??'',limit:Number(option('limit','10000')),onCheckpoint:value=>save(output,value)})
  console.log(JSON.stringify({artists:report.artists.length,counts:report.counts,apiCalls:report.apiCalls,applied:false}))
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'CHANNEL_RUN_FAILED');process.exitCode=1})
