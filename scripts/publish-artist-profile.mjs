import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { profileStateStore, profileAttemptKey } from './artist-profile-state.mjs'

const fail = code => { throw Error(code) }
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').trim()
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
const safeUrl = value => { try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash } catch { return false } }

// No source-directed redirects or arbitrary fetches to private/internal networks.
export function evidenceUrl(value) {
  if (!safeUrl(value)) return false
  const u = new URL(value), h = u.hostname
  return h.includes('.') && !/^(?:\d|localhost$)/.test(h) && !/\.(?:local|internal|localhost|test|invalid)$/.test(h)
    && !h.includes(':') && !h.endsWith('.supabase.co') && !/[?&](?:key|token|secret|signature)=/i.test(u.search)
}
export async function prepareProfile(event, { fetcher=fetch, key, now=Date.now() }={}) {
  if (event.status !== 'candidate' && event.status !== 'approved') fail('PROFILE_CANDIDATE_HELD')
  const get = async (url, headers={}) => {
    if (!evidenceUrl(url)) fail('PROFILE_SOURCE_URL_INVALID')
    const response=await fetcher(url,{headers:{'User-Agent':'ConcertFinder/1.0 (artist profile verification)',...headers},redirect:'error',signal:AbortSignal.timeout(20000)})
    if (!response.ok) fail('PROFILE_SOURCE_UNAVAILABLE')
    return response
  }
  const checkedAt=new Date(now).toISOString(), c=event.candidate
  const mb=await (await get(`https://musicbrainz.org/ws/2/artist/${event.musicBrainzId}?inc=url-rels&fmt=json`)).json()
  const qids=[...new Set((mb.relations??[]).filter(r=>r.type==='wikidata').map(r=>r.url?.resource).filter(u=>/^https:\/\/www.wikidata.org\/wiki\/Q\d+$/.test(u)))]
  if(qids.length!==1) fail('PROFILE_IDENTITY_REQUIRED')
  const wikidata=qids[0], q=wikidata.split('/').pop()
  const entity=(await (await get(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`)).json()).entities?.[q]
  if(!entity?.claims?.P434?.some(s=>s.rank!=='deprecated' && s.mainsnak?.datavalue?.value===event.musicBrainzId)) fail('PROFILE_IDENTITY_REQUIRED')
  const source=event.sources.find(s=>s.revision===c.sourceRevision && /^https:\/\/[a-z-]+\.wikipedia.org\/wiki\//.test(s.url))
  if(!source || !source.authorsUrl || source.licenseUrl!=='https://creativecommons.org/licenses/by-sa/4.0/') fail('PROFILE_ATTRIBUTION_REQUIRED')
  const wikipedia=source.url.split('?')[0], wiki=new URL(wikipedia)
  const language=wiki.hostname.split('.')[0], sitelink=entity.sitelinks?.[`${language}wiki`]?.title
  if(!sitelink || decodeURIComponent(wiki.pathname.slice(6)).replaceAll('_',' ')!==sitelink.replaceAll('_',' ')
    || (entity.sitelinks?.kowiki && language!=='ko')) fail('PROFILE_IDENTITY_REQUIRED')
  const revision=await (await get(`${wiki.origin}/w/api.php?${new URLSearchParams({action:'query',format:'json',prop:'revisions',revids:String(c.sourceRevision),rvprop:'ids'})}`)).json()
  if(!Object.values(revision.query?.pages??{}).some(p=>p.title===sitelink && p.revisions?.some(r=>r.revid===c.sourceRevision))) fail('PROFILE_REVISION_REQUIRED')
  const payload={identity:{bandId:event.bandId,musicBrainzId:event.musicBrainzId,wikidata},bio:c.bio,wikipedia,language:c.language==='ko'?'한국어':c.language,
    bioSource:{revision:c.sourceRevision,revisionUrl:source.url,authorsUrl:source.authorsUrl,licenseUrl:source.licenseUrl,checkedAt,modification:language==='ko'?'한국어 요약·수정':`${c.language} 원문 한국어 요약·번역·수정`},channel:'',music:[],live:[]}
  const banner=c.banner
  // Editorial-only illustrations and held images never enter the production payload.
  if(banner?.status==='candidate' && /^https:\/\/commons.wikimedia.org\/wiki\/File:/.test(banner.url??'')) {
    const image=await (await get(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({action:'query',format:'json',titles:decodeURIComponent(new URL(banner.url).pathname.slice(6)),prop:'imageinfo',iiprop:'url|extmetadata'})}`)).json()
    const info=Object.values(image.query?.pages??{})[0]?.imageinfo?.[0], m=info?.extmetadata
    if(info && m && !plain(m.Restrictions?.value) && plain(m.Artist?.value)
      && /^https:\/\/(upload|thumb).wikimedia.org\//.test(info.url)
      && /^https:\/\/creativecommons.org\/licenses\/by(-sa)?\/(2\.0|2\.5|3\.0|4\.0)\/?$/.test(m.LicenseUrl?.value??'')) {
      payload.banner={url:info.url,source:banner.url,author:plain(m.Artist.value),credit:plain(m.Credit?.value),license:plain(m.LicenseShortName.value),licenseUrl:m.LicenseUrl.value,useScope:'production_commons',restrictions:'',checkedAt}
    }
  }
  const videos=(c.videos??[]).filter(v=>v.status==='candidate' && ['music','live'].includes(v.kind))
  if(videos.length) {
    if(!key) fail('PROFILE_YOUTUBE_ENV_REQUIRED')
    if(videos.length>12 || videos.some(v=>!/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || !/^UC[A-Za-z0-9_-]{22}$/.test(v.channelId))) fail('PROFILE_VIDEO_INVALID')
    const api=await (await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${videos.map(v=>v.videoId).join(',')}`,{'X-Goog-Api-Key':key})).json()
    const items=new Map((api.items??[]).map(v=>[v.id,v]))
    const pages=new Map()
    const officialHosts=new Set([...(mb.relations??[]).filter(r=>r.type==='official homepage').map(r=>r.url?.resource),...(entity.claims.P856??[]).filter(s=>s.rank!=='deprecated').map(s=>s.mainsnak?.datavalue?.value)].filter(evidenceUrl).map(u=>new URL(u).hostname.replace(/^www\./,'')))
    for(const v of videos) {
      const actual=items.get(v.videoId)
      if(actual?.snippet?.channelId!==v.channelId || actual.status?.privacyStatus!=='public') continue
      const channel=`https://www.youtube.com/channel/${v.channelId}`
      const proofs=[]
      if((mb.relations??[]).some(r=>r.type==='youtube' && r.url?.resource===channel)) proofs.push(`https://musicbrainz.org/artist/${event.musicBrainzId}`)
      // Candidate officiality is independently linked by MB or an HTTPS official source.
      for(const s of event.sources.filter(s=>officialHosts.has(new URL(s.url).hostname.replace(/^www\./,'')))) {
        if(proofs.length && !s.url.includes('universal-music.co.jp')) continue
        if(!pages.has(s.url)) pages.set(s.url,await (await get(s.url)).text())
        const html=pages.get(s.url)
        const links=[...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m=>m[1].replaceAll('&amp;','&'))
        if(links.some(u=>u===channel || u.startsWith(channel+'/') || u===`https://youtu.be/${v.videoId}` || u===`https://www.youtube.com/watch?v=${v.videoId}`)) proofs.push(s.url)
      }
      if(!proofs.length || !v.officialityBasis) continue
      if(payload[v.kind].length>=6) continue
      payload[v.kind].push({id:v.videoId,title:v.title,publisher:actual.snippet.channelTitle??v.publisher,channelId:v.channelId,checkedAt,officialityBasis:v.officialityBasis,evidenceUrls:proofs})
      // Prefer the artist's own MB relation; guest broadcaster stays a per-video publisher.
      if(!payload.channel || proofs[0].includes('musicbrainz.org')) payload.channel=channel
    }
  }
  return payload
}

export async function publishCandidate(client, publicClient, locator, options={}) {
  const sourceKey=profileAttemptKey(locator), event=await profileStateStore(client).readAttempt(locator)
  const {data:band,error:bandError}=await client.from('bands').select('id,musicbrainz_id,updated_at,curation_status').eq('id',event.bandId).single()
  if(bandError || band?.curation_status!=='approved') fail('PROFILE_ARTIST_NOT_APPROVED')
  if(band.musicbrainz_id!==event.musicBrainzId || Date.parse(band.updated_at)!==Date.parse(event.sourceVersion)) fail('PROFILE_EDIT_CONFLICT')
  const state=await client.rpc('service_artist_profile_state',{target_band_id:event.bandId})
  if(state.error) fail('PROFILE_WRITER_UNAVAILABLE')
  if(state.data?.locked) fail('PROFILE_MANUAL_LOCK')
  const previous=state.data
  let payload,receipt
  if(previous?.source_key===sourceKey) {payload=previous.content;receipt={status:'already_applied',version:previous.updated_at,sourceKey}}
  else {
    payload=await prepareProfile(event,options)
    const args={target_band_id:event.bandId,expected_band_version:event.sourceVersion,expected_profile_version:previous?.updated_at??null,candidate_key:sourceKey,payload}
    const result=await client.rpc('service_apply_artist_profile',args)
    receipt=result.data
    if(result.error) {
      // Recover an uncertain response only from exact persisted content; never blindly retry a writer.
      const check=await client.rpc('service_artist_profile_state',{target_band_id:event.bandId})
      if(check.error || check.data?.source_key!==sourceKey || !same(check.data?.content,payload)) fail(/^PROFILE_[A-Z_]+$/.test(result.error.message??'')?result.error.message:'PROFILE_APPLY_UNCONFIRMED')
      receipt={status:'recovered',version:check.data.updated_at,sourceKey}
    }
  }
  const verify=await client.rpc('service_artist_profile_state',{target_band_id:event.bandId})
  if(verify.error || verify.data?.source_key!==sourceKey || !same(verify.data.content,payload)) fail('PROFILE_READBACK_FAILED')
  const visible=await publicClient.rpc('artist_profile_content',{target_band_id:event.bandId})
  if(visible.error || visible.data?.identity?.musicBrainzId!==event.musicBrainzId || visible.data?.bio!==payload.bio) fail('PROFILE_PUBLIC_READBACK_FAILED')
  for(const kind of ['music','live']) if(!same(visible.data[kind],payload[kind].filter(v=>Date.parse(v.checkedAt)>(options.now??Date.now())-7*86400000))) fail('PROFILE_PUBLIC_READBACK_FAILED')
  return {...receipt,bandId:event.bandId,privateReadback:true,publicReadback:true,music:visible.data.music.length,live:visible.data.live.length,banner:Boolean(visible.data.banner)}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  if(process.argv.length!==4 || process.argv[2]!=='--apply-candidate') fail('PROFILE_APPLY_ARGUMENT_REQUIRED')
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') || process.env.VITE_SUPABASE_URL!==process.env.SUPABASE_URL) fail('PROFILE_SERVER_ENV_REQUIRED')
  const options={auth:{persistSession:false,autoRefreshToken:false}}, client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options), publicClient=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options)
  const locator=JSON.parse(await readFile(process.argv[3],'utf8'))
  console.log(JSON.stringify(await publishCandidate(client,publicClient,locator,{key:process.env.YOUTUBE_API_KEY})))
 } catch(error) {console.error(/^PROFILE_[A-Z_]+$/.test(error.message??'')?error.message:'PROFILE_APPLY_FAILED');process.exitCode=1}
}
