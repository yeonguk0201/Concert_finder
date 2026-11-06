// Bounded review of the already registered pilot. Uses the existing source
// lease/completion RPCs, with no artist writes and publication OFF throughout.
// Source-use review is supplied explicitly for the separate notice phase.
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { JSDOM } from 'jsdom'
import { factRegressionReasons } from './collection-fact-guards.mjs'

export const pilotId = '647835a8-7bed-4ef8-94c8-d7123c558e63'
const bandId = '0d2368ee-72d7-4ec8-aa52-5a708452963f'
const identityKey = 'mb:09d4a85c-4916-4b4e-bc96-c4cfcf371046'
const sourceUrl = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF304185'
const noticeUrl = 'https://news.livenationentertainment.com/news/kenshi-yonezu-announces-dates-in-north-america-asia-europe-and-the-uk-on-ghost-world-tour'
const useBasis = 'https://news.livenationentertainment.com/media'

export function prepareKopisReview(candidate, band, facts, checkedAt, expectedRevision) {
  if (candidate.id !== pilotId || candidate.revision !== expectedRevision || candidate.source_url !== sourceUrl
    || candidate.status !== 'pending' || candidate.automation_blocked !== false) throw Error('PILOT_REVISION_OR_DECISION_CHANGED')
  if (band.id !== bandId || band.curation_status !== 'approved' || band.country_code !== 'JP'
    || `mb:${band.musicbrainz_id}` !== identityKey || band.name !== '요네즈 켄시') throw Error('PILOT_ARTIST_UNVERIFIED')
  const expected = { mt20id: 'PF304185', prfnm: '요네즈 켄시 내한공연', prfpdfrom: '2027.01.14',
    prfpdto: '2027.01.17', fcltynm: '인스파이어 엔터테인먼트 리조트 (아레나)',
    prfcast: '요네즈 켄시', area: '인천광역시', dtguidance: '목요일(19:30), 토요일 ~ 일요일(19:00)', prfstate: '공연예정' }
  if (Object.entries(expected).some(([k, v]) => facts[k] !== v)
    || !Number.isFinite(Date.parse(checkedAt))) throw Error('PILOT_OFFICIAL_FACTS_CHANGED')
  const p = structuredClone(candidate.payload)
  if (p.title !== facts.prfnm || p.starts_on !== '2027-01-14' || p.ends_on !== '2027-01-17'
    || p.venue !== facts.fcltynm || p.city !== facts.area || p.cancelled !== false || p.country_code !== 'KR'
    || p.artist_keys.length || p.band_ids.length || p.discovered_artists.length !== 1
    || p.discovered_artists[0].name !== facts.prfcast || p.discovered_artists[0].source_url !== sourceUrl
    || p.discovered_artists[0].key || p.announcement_verified !== false || p.announced_on !== null
    || p.announced_at !== null || p.ticket.opens_at !== null || p.ticket_evidence.length) throw Error('PILOT_EXISTING_FACTS_REQUIRE_REVIEW')
  p.artist_keys = [identityKey]; p.band_ids = [bandId]
  Object.assign(p.discovered_artists[0], { key: identityKey, band_id: bandId, reason: null })
  p.sessions = [['2027-01-14', '19:30'], ['2027-01-16', '19:00'], ['2027-01-17', '19:00']]
    .map(([day, time]) => ({ label: `${day} ${time}`, starts_on: day, starts_at: `${day}T${time}:00+09:00` }))
  p.sources = p.sources.map(s => s.url === sourceUrl ? { ...s, verified_at: checkedAt } : s)
  p.review_reasons = p.review_reasons.filter(r => r !== '미연결 출연진이 있습니다. 이름은 보존되며 신원 확인 후 연결하세요.')
  if (factRegressionReasons(candidate.payload, p).length) throw Error('PILOT_FACT_REGRESSION')
  return { source_url: sourceUrl, content_hash: createHash('sha256').update(JSON.stringify(p)).digest('hex'), payload: p }
}

export function prepareNoticeReview(candidate, review, expectedRevision, now = Date.now()) {
  const p = structuredClone(candidate.payload), checked = Date.parse(review?.checkedAt)
  if (candidate.id !== pilotId || candidate.source_url !== sourceUrl || candidate.revision !== expectedRevision
    || candidate.status !== 'pending' || candidate.automation_blocked !== false) throw Error('PILOT_REVISION_OR_DECISION_CHANGED')
  if (review.sourceUrl !== noticeUrl || review.useBasisUrl !== useBasis || review.purpose !== 'nonprofit_editorial_concert_information'
    || review.useScopeReviewed !== true || !Number.isFinite(checked) || checked > now || now - checked > 3600000
    || review.announcedOn !== '2026-10-15' || review.generalSale !== '2026-10-22T12:00:00+09:00'
    || JSON.stringify(review.performanceDays) !== JSON.stringify(['2027-01-14', '2027-01-16', '2027-01-17'])
    || review.excludesBodiesImagesLogos !== true) throw Error('PILOT_NOTICE_SCOPE_UNVERIFIED')
  if (p.title !== '요네즈 켄시 내한공연' || p.starts_on !== '2027-01-14' || p.ends_on !== '2027-01-17'
    || p.city !== '인천광역시' || p.venue !== '인스파이어 엔터테인먼트 리조트 (아레나)'
    || p.cancelled !== false || p.country_code !== 'KR' || p.format !== 'solo'
    || JSON.stringify(p.artist_keys) !== JSON.stringify([identityKey]) || JSON.stringify(p.band_ids) !== JSON.stringify([bandId])
    || p.discovered_artists.length !== 1 || p.discovered_artists[0].key !== identityKey || p.discovered_artists[0].band_id !== bandId
    || p.sessions.length !== 3 || p.sessions.some((s, i) => s.starts_on !== review.performanceDays[i]
      || s.starts_at !== `${review.performanceDays[i]}T${i === 0 ? '19:30' : '19:00'}:00+09:00`)
    || p.announcement_verified !== false || p.announced_on !== null || p.announced_at !== null
    || p.ticket.opens_at !== null || p.ticket_evidence.length || p.initial_import !== true
    || p.review_reasons.some(r => !['KOPIS 발견 후보: 대상 장르·출연진·공식 발표 검수 필요',
      '일반 예매 시각은 주최사·예매처 공식 공지로 보완'].includes(r))) throw Error('PILOT_EXISTING_FACTS_REQUIRE_REVIEW')
  Object.assign(p, { announced_on: review.announcedOn, announced_at: null,
    announcement_precision: 'day', announcement_verified: true, review_reasons: [] })
  // A homepage is sufficient as a safe navigation destination. Do not expose
  // the unpermitted NOL/Interpark product deep link from the raw API payload.
  p.ticket.opens_at = review.generalSale
  p.ticket.booking_url = 'https://www.livenation.com/'
  p.booking_links = [{ label: 'Live Nation', url: 'https://www.livenation.com/' }]
  p.sources.push({ url: noticeUrl, label: 'Live Nation Newsroom · 공연 발표 및 일반예매 공지', verified_at: review.checkedAt })
  p.ticket_evidence = [{ method: 'official_notice', publisher_role: 'promoter', source_use_verified: true,
    use_basis_url: useBasis, sale_type: 'general', event_matched: true, source_url: noticeUrl,
    opens_at: review.generalSale, verified_at: review.checkedAt }]
  p.announcement_evidence = { method: 'official_notice', source_url: noticeUrl,
    announced_on: review.announcedOn, precision: 'day', verified_at: review.checkedAt }
  p.editorial_use = { purpose: review.purpose, use_basis_url: useBasis, reviewed_at: review.checkedAt,
    scopes: ['concert_facts', 'source_links'], bodies_images_logos: false }
  p.presale_review = { status: 'no_verified_presale_in_reviewed_notice', source_url: noticeUrl, checked_at: review.checkedAt }
  if (factRegressionReasons(candidate.payload, p).length) throw Error('PILOT_FACT_REGRESSION')
  return { source_url: sourceUrl, content_hash: createHash('sha256').update(JSON.stringify(p)).digest('hex'), payload: p }
}

async function run({ apply, expectedRevision, noticePath }) {
  if (process.env.SUPABASE_URL !== 'https://czjrzylvnewfjnfwjhwf.supabase.co') throw Error('PROJECT_MISMATCH')
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const unwrap = r => { if (r.error) throw Error('PILOT_API_FAILED'); return r.data }
  const candidate = () => client.from('collection_candidates').select('*').eq('id', pilotId).single().then(unwrap)
  const band = await client.from('bands').select('id,name,country_code,musicbrainz_id,curation_status').eq('id', bandId).single().then(unwrap)
  const policy = async () => {
    const p = await client.from('collection_policies').select('*').eq('source', 'kopis').single().then(unwrap)
    if (!p.collection_enabled || p.publication_enabled || p.live_after !== null) throw Error('PILOT_POLICY_CHANGED')
    return p
  }
  await policy()
  const u = new URL('https://kopis.or.kr/openApi/restful/pblprfr/PF304185')
  u.searchParams.set('service', process.env.KOPIS_SERVICE_KEY)
  const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(25000) })
  if (!r.ok) throw Error(`PILOT_KOPIS_HTTP_${r.status}`)
  const xml = await r.text()
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('PILOT_INVALID_XML')
  const d = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  if (d.querySelectorAll('db').length !== 1) throw Error('PILOT_INVALID_XML')
  const fields = ['mt20id', 'prfnm', 'prfpdfrom', 'prfpdto', 'fcltynm', 'prfcast', 'area', 'dtguidance', 'prfstate']
  const facts = Object.fromEntries(fields.map(k => [k, d.querySelector(k)?.textContent.trim()]))
  const checkedAt = new Date().toISOString(), before = await candidate()
  const notice = noticePath ? JSON.parse(await readFile(noticePath, 'utf8')) : null
  if (band.curation_status !== 'approved' || band.musicbrainz_id !== identityKey.slice(3)) throw Error('PILOT_ARTIST_UNVERIFIED')
  const row = notice ? prepareNoticeReview(before, notice, expectedRevision)
    : prepareKopisReview(before, band, facts, checkedAt, expectedRevision)
  if (notice && (facts.mt20id !== 'PF304185' || facts.prfcast !== band.name || facts.prfstate !== '공연예정'
    || facts.dtguidance !== '목요일(19:30), 토요일 ~ 일요일(19:00)' || facts.prfpdfrom !== '2027.01.14'
    || facts.prfpdto !== '2027.01.17' || facts.fcltynm !== before.payload.venue)) throw Error('PILOT_OFFICIAL_FACTS_CHANGED')
  const directory = resolve('.local/concert-operations')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const report = { checkedAt, applied: false, beforeRevision: before.revision, candidateId: pilotId,
    facts, row, reviewMethod: notice ? 'official_notice_editorial_facts' : 'kopis_lineup_sessions',
    unresolved: [...(notice ? [] : ['official announcement day and use scope', 'general-sale evidence and use scope']),
      'v3 deployment confirmation', 'original scheduled runtime adoption and resumption', 'separate publication ON approval'] }
  if (apply) {
    const runToken = unwrap(await client.rpc('service_begin_collection', { source_name: 'kopis', scheduled_at: checkedAt }))
    if (!runToken) throw Error('PILOT_SOURCE_BUSY')
    report.runId = runToken
    try {
      await policy()
      const latest = await candidate()
      if (latest.revision !== before.revision || latest.content_hash !== before.content_hash
        || latest.status !== 'pending' || latest.automation_blocked) throw Error('PILOT_REVISION_OR_DECISION_CHANGED')
      report.result = unwrap(await client.rpc('service_complete_collection', { run_token: runToken,
        batch: { candidates: [row], failures: [], excluded: [] }, identities: [], attempt_count: 1, adapter_version: 'catalog-v1' }))
      if (report.result.published !== 0 || report.result.review !== 1) throw Error('PILOT_RESULT_UNEXPECTED')
      report.after = await candidate()
      if (report.after.revision !== before.revision + 1 || report.after.payload.artist_keys[0] !== identityKey
        || report.after.payload.band_ids[0] !== bandId || report.after.payload.sessions.length !== 3
        || report.after.payload.announcement_verified !== Boolean(notice)
        || report.after.payload.ticket.opens_at !== (notice ? notice.generalSale : null)) throw Error('PILOT_READBACK_UNCONFIRMED')
      report.applied = true
    } catch (error) {
      await client.rpc('service_fail_collection', { run_token: runToken, attempt_count: 1, failure_code: 'PILOT_REVIEW_UNCONFIRMED' })
      throw error
    }
  }
  const output = `yonezu-${notice ? 'notice' : 'kopis'}-review-20261106${apply ? '' : '-plan'}.json`
  await writeFile(resolve(directory, output), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  console.log(JSON.stringify({ applied: report.applied, runId: report.runId, beforeRevision: before.revision,
    afterRevision: report.after?.revision, published: report.result?.published ?? 0 }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const expectedRevision = Number(process.argv.find(a => a.startsWith('--revision='))?.slice(11))
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw Error('EXPECTED_REVISION_REQUIRED')
  const noticePath = process.argv.find(a => a.startsWith('--notice='))?.slice(9)
  run({ apply: process.argv.includes('--apply'), expectedRevision, noticePath }).catch(() => { console.error('PILOT_REVIEW_FAILED'); process.exitCode = 1 })
}
