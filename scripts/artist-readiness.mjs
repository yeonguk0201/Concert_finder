import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const normalizeArtistName = value => value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g,' ')
const identityMatches = (band, old) => band.name === old.name && band.country_code === old.countryCode && band.musicbrainz_id === old.musicBrainzId && JSON.stringify([...band.aliases].sort()) === JSON.stringify([...old.aliases].sort())
const timestamp = value => String(value).replace(' ','T').replace(/\+00$/, '+00:00')
export function specificEvidence(url) {
  try {
    const value = new URL(url)
    if (value.protocol !== 'https:') return false
    // These were placeholder directory URLs in the previous report.
    if (value.hostname === 'music.apple.com' && /^\/[^/]+\/artist\/?$/.test(value.pathname)) return false
    return !value.href.includes('undefined')
  } catch { return false }
}

export function auditArtistReadiness(bands, previous, priority, checkedAt = new Date().toISOString()) {
  const byId = new Map(previous.rows.map(row => [row.bandId,row]))
  const rows = bands.map(band => {
    const old = byId.get(band.id)
    let reason = '', result = 'needs_review'
    if (band.curation_status !== 'unreviewed') { result='preserve_existing'; reason='기존 관리 상태를 보존하며 자동 덮어쓰지 않음' }
    else if (!old) reason='이전 검수에 없는 신규 신원'
    else if (!identityMatches(band, old.identitySnapshot)) reason='신원·별칭 변경: 이전 근거 재사용 불가'
    else if (old.verdict !== 'keep') reason='이전 보류·실패는 완료 검수로 재사용하지 않음'
    else if (old.policy !== 'jpop-or-rock-v1' || !Number.isFinite(Date.parse(old.checkedAt)) || !Number.isFinite(Date.parse(checkedAt)) || Date.parse(checkedAt)-Date.parse(old.checkedAt) > 90*86400000 || Date.parse(checkedAt) < Date.parse(old.checkedAt)) reason='정책·검수 유효기간 불일치'
    else if (!old.sources?.length || old.sources.some(source=>!specificEvidence(source.url))) reason='아티스트별 근거 누락 또는 placeholder 주소: 이전 유지 판정 재검수'
    else if (timestamp(band.updated_at) !== timestamp(old.after?.updatedAt) || band.curation_status !== old.after?.status) reason='DB 상태·버전 변경: 이전 근거 재사용 전 변경 검토 필요'
    else { result='reusable_keep'; reason='동일 정책·신원·별칭·상태·버전의 90일 이내 유지 기록; DB 승인과 구분' }
    return { bandId:band.id, identitySnapshot:{name:band.name,aliases:band.aliases,countryCode:band.country_code,musicBrainzId:band.musicbrainz_id}, result, reason, previousCheckedAt:old?.checkedAt ?? null, sources:old?.sources ?? [], status:band.curation_status, version:band.updated_at, applied:false }
  })
  const indexes = new Map()
  for (const band of bands) for (const name of new Set([band.name,...band.aliases].map(normalizeArtistName))) {
    if (!name) continue
    if (!indexes.has(name)) indexes.set(name,[])
    indexes.get(name).push(band)
  }
  const collisions = [...indexes].filter(([,rows])=>rows.length>1).map(([name,rows])=>({name,artists:rows.map(b=>({id:b.id,name:b.name,musicBrainzId:b.musicbrainz_id})),action:'동명/별칭 충돌 후보: 자동 병합하지 않음'}))
  const priorities = priority.artists.map(item=>{
    // Only external identity is authoritative; names are used solely for gap hints.
    const band = bands.find(b=>b.musicbrainz_id === item.musicBrainzId)
    return {...item,bandId:band?.id ?? null,status:band?.curation_status ?? 'missing',aliases:band?.aliases ?? [],aliasGaps:(item.expectedAliases??[]).filter(a=>![band?.name,...(band?.aliases??[])].filter(Boolean).map(normalizeArtistName).includes(normalizeArtistName(a))),review:band ? rows.find(r=>r.bandId===band.id)?.result : 'needs_registration',photo:band?.photo_mode==='manual' && band.representative_photo ? {status:'stored',source:band.representative_photo.source,license:band.representative_photo.license} : {status:'unsecured',reason:'재보관·축소·표시 권리와 저작자를 모두 확인한 파일 미확보; 이니셜 유지'},nameCandidates:band?[]:(indexes.get(normalizeArtistName(item.name))??[]).map(b=>b.id)}
  })
  const counts = Object.fromEntries(['reusable_keep','needs_review','preserve_existing'].map(key=>[key,rows.filter(row=>row.result===key).length]))
  const gapCandidates=(priority.gapCandidates??[]).map(item=>({...item,nameMatches:[...new Set(item.names.flatMap(name=>(indexes.get(normalizeArtistName(name))??[]).map(b=>b.id)))],note:'이름/별칭 기반 누락 점검 후보. 등록 전에 공식 신원·외부 ID 대조 필요'}))
  return {policy:'jpop-or-rock-v1',checkedAt,scope:{total:bands.length},counts,rows,collisions,priorities,gapCandidates,appliedChanges:[],limitations:[`기존 근거 재사용 가능 여부를 검사한 준비 점검이며 ${bands.length}팀의 공식 자료를 새로 조사한 결과가 아님`,'reusable_keep는 DB 승인·공연 자동 공개 승인이 아님','사진 권리는 장르 검수와 별도로 확인; 자동 사진 캐시는 확보 파일로 집계하지 않음']}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [snapshotFile, reportFile, outputFile] = process.argv.slice(2)
  if (!snapshotFile || !reportFile || !outputFile) throw new Error('Usage: node scripts/artist-readiness.mjs snapshot.json previous-report.json output.json')
  const bands=JSON.parse(await readFile(snapshotFile,'utf8'))
  const previous=JSON.parse(await readFile(reportFile,'utf8'))
  const priority=JSON.parse(await readFile(new URL('../supabase/manual/priority-artists.json',import.meta.url),'utf8'))
  const report=auditArtistReadiness(bands,previous,priority)
  await writeFile(outputFile,JSON.stringify(report,null,2)+'\n','utf8')
  console.log(JSON.stringify({counts:report.counts,collisions:report.collisions.length,priority:report.priorities.length,missing:report.priorities.filter(p=>p.status==='missing').length}))
}
