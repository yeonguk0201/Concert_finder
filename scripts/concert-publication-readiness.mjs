import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const hosts = { ualive: 'ualive.com', mintpaper: 'www.mintpaper.co.kr', radwimps: 'radwimps.jp',
  kopis: 'www.kopis.or.kr', yes24: 'ticket.yes24.com' }
const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const instant = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s ?? '') && day(s.slice(0, 10)) && Number.isFinite(Date.parse(s))
const kstDay = n => new Date(n).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const https = s => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password } catch { return false } }
const nol = s => { try { return /(^|\.)(nol\.com|nol\.yanolja\.com|interpark\.com)$/.test(new URL(s).hostname) } catch { return false } }
function generalEvidence(e, sale, sources, now) {
  return e.method === 'api' && e.sale_type === 'general' && e.event_matched === true && !e.reason
    && !['line', 'body', 'html', 'image'].some(key => key in e)
    && instant(e.opens_at) && Date.parse(e.opens_at) === Date.parse(sale) && https(e.source_url)
    && instant(e.verified_at) && Date.parse(e.verified_at) <= now
    && sources?.some(s => s.url === e.source_url && instant(s.verified_at) && Date.parse(s.verified_at) <= now)
}

// Advisory only: inputs are observed DB/evidence snapshots, never authority to
// change policy, certify evidence, bypass server checks or send notifications.
export function assessPublicationReadiness(snapshot, { now = Date.now() } = {}) {
  if (snapshot?.version !== 1 || !instant(snapshot.observedAt) || Date.parse(snapshot.observedAt) > now
    || now - Date.parse(snapshot.observedAt) > 3600000 || !Array.isArray(snapshot.sources)
    || new Set(snapshot.sources.map(s => s.source)).size !== snapshot.sources.length) throw Error('PUBLICATION_SNAPSHOT_INVALID')
  const sources = snapshot.sources.map(source => {
    // This optional adapter is outside the current launch. Its missing permit
    // cannot become a requirement on an independent official source.
    if (source.source === 'reissue_nol') return { source: source.source, status: 'EXCLUDED_OPTIONAL', eligible: 0, blockers: [] }
    if (!hosts[source.source] || !Array.isArray(source.candidates)) throw Error('PUBLICATION_SNAPSHOT_INVALID')
    const blockers = [], permission = source.permission
    if (permission?.state !== 'allowed' || !permission.scopes?.includes('publication')
      || !instant(permission.checkedAt) || Date.parse(permission.checkedAt) > now
      || now - Date.parse(permission.checkedAt) > 90 * 86400000
      || !permission.sourceUrls?.length || !permission.sourceUrls.every(https)) blockers.push('SOURCE_USE_UNVERIFIED')
    // This rollout permits API facts and attribution links only. A page/robots
    // check or publication flag does not authorize copying bodies or images.
    if (permission?.method !== 'api' || !Array.isArray(permission.scopes)
      || !['concert_facts', 'source_links'].every(scope => permission.scopes.includes(scope))
      || permission.scopes.some(scope => !['publication', 'concert_facts', 'source_links'].includes(scope))) blockers.push('SOURCE_USE_SCOPE_UNVERIFIED')
    if (source.adapterVerified !== true) blockers.push('ADAPTER_UNVERIFIED')
    if (source.runnerCompatible !== true) blockers.push('RUNNER_NOT_PUBLICATION_COMPATIBLE')
    if (source.policy?.collection_enabled !== true) blockers.push('COLLECTION_DISABLED')
    if (source.policy?.adapter_version !== source.adapterVersion) blockers.push('ADAPTER_VERSION_MISMATCH')
    if (source.activeLease !== false) blockers.push('SOURCE_LEASE_NOT_IDLE')
    if (source.policy?.live_after != null && !instant(source.policy.live_after)) blockers.push('POLICY_TIMESTAMP_UNVERIFIED')
    const candidates = source.candidates.map(row => {
      const p = row.payload ?? {}, reasons = [], fail = (test, code) => { if (!test) reasons.push(code) }
      let url; try { url = new URL(row.source_url) } catch { /* unknown source stays blocked */ }
      fail(url?.protocol === 'https:' && url.hostname === hosts[source.source] && !url.username && !url.password, 'SOURCE_MISMATCH')
      // A booking destination is a link, not evidence acquired from that site.
      // NOL evidence remains excluded even when the booking link points elsewhere.
      fail(![row.source_url, ...(p.sources ?? []).map(s => s.url), ...(p.ticket_evidence ?? []).map(e => e.source_url)].some(nol), 'OPTIONAL_NOL_DEPENDENCY')
      fail(row.automation_blocked === false, 'MANUAL_BLOCK_OR_UNKNOWN')
      fail(p.cancelled === false, 'CANCELLED_OR_UNKNOWN')
      fail(p.country_code === 'KR' && Boolean(p.city?.trim()) && Boolean(p.venue?.trim()), 'KOREA_VENUE_UNVERIFIED')
      fail(Boolean(p.title?.trim()) && ['solo', 'festival'].includes(p.format), 'EVENT_UNVERIFIED')
      fail(day(p.starts_on) && day(p.ends_on ?? p.starts_on) && p.starts_on <= (p.ends_on ?? p.starts_on)
        && (p.ends_on ?? p.starts_on) >= kstDay(now), 'PERFORMANCE_DATES_UNVERIFIED_OR_PAST')
      fail(p.announcement_verified === true && instant(p.announced_at) && Date.parse(p.announced_at) <= now
        && day(p.announced_on) && p.announced_on === kstDay(Date.parse(p.announced_at)), 'ANNOUNCEMENT_UNVERIFIED')
      fail(Array.isArray(p.sessions) && p.sessions.length > 0 && p.sessions.every(s => instant(s.starts_at)
        && day(s.starts_on) && s.starts_on === kstDay(Date.parse(s.starts_at))
        && s.starts_on >= p.starts_on && s.starts_on <= (p.ends_on ?? p.starts_on))
        && new Set(p.sessions.map(s => Date.parse(s.starts_at))).size === p.sessions.length, 'SESSIONS_UNVERIFIED')
      const sale = p.ticket?.opens_at
      fail(instant(sale) && p.ticket_evidence?.some(e => generalEvidence(e, sale, p.sources, now))
        && p.sessions?.some(s => instant(s.starts_at)) && p.sessions.every(s => Date.parse(sale) <= Date.parse(s.starts_at)), 'GENERAL_SALE_UNVERIFIED')
      fail(Array.isArray(p.review_reasons) && p.review_reasons.length === 0, 'PARSER_REVIEW_REQUIRED')
      fail(row.context?.identityApproved === true, 'ARTIST_IDENTITY_OR_APPROVAL_UNVERIFIED')
      fail(row.context?.duplicateFree === true, 'DUPLICATE_OR_EXISTING_EVENT')
      fail(row.context?.changeReviewed === true, 'IMPORTANT_CHANGE_UNREVIEWED')
      fail(p.sources?.some(s => s.url === row.source_url && instant(s.verified_at) && Date.parse(s.verified_at) <= now), 'SOURCE_FACTS_UNVERIFIED')
      return { id: row.id, revision: row.revision, eligible: reasons.length === 0, reasons,
        notificationMode: !source.policy?.live_after || p.initial_import === true || instant(sale) && Date.parse(sale) <= now
          || day(p.announced_on) && p.announced_on <= kstDay(Date.parse(source.policy.live_after)) ? 'SILENT_BACKFILL' : 'EXISTING_CONSENT_WORKER_ONLY' }
    })
    const eligible = candidates.filter(c => c.eligible).length
    if (!eligible) blockers.push('NO_VERIFIED_CANDIDATES')
    return { source: source.source, status: blockers.length ? 'BLOCKED'
      : source.policy.publication_enabled === true ? 'ACTIVE_VERIFIED' : 'READY_FOR_ACTIVATION', eligible, blockers, candidates }
  })
  return { version: 1, observedAt: snapshot.observedAt, nolRequiredForLaunch: false,
    status: sources.some(s => ['READY_FOR_ACTIVATION', 'ACTIVE_VERIFIED'].includes(s.status)) ? 'PARTIAL_LAUNCH_AVAILABLE' : 'NO_VERIFIED_SOURCE_READY', sources }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [input, output] = process.argv.slice(2)
    if (!input || !output) throw Error('PUBLICATION_INPUT_AND_OUTPUT_REQUIRED')
    const report = assessPublicationReadiness(JSON.parse(await readFile(input, 'utf8')))
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ status: report.status, sources: report.sources.map(({ source, status, eligible, blockers }) => ({ source, status, eligible, blockers })) }))
  } catch { console.error('PUBLICATION_READINESS_FAILED'); process.exitCode = 1 }
}
