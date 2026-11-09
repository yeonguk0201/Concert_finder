// Proposed API-first contract only. These rows are not release credentials for
// the currently deployed reviewed-publication executor.
import { JSDOM } from 'jsdom'
import { createHash } from 'node:crypto'
import { parseKopis } from './kopis.mjs'
import { factRegressionReasons } from './collection-fact-guards.mjs'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const dayMs = 86400000
const weekdays = ['월', '화', '수', '목', '금', '토', '일']
const nameKey = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const validDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const instant = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(s)
  && validDay(s.slice(0, 10)) && Number.isFinite(Date.parse(s))
const fresh = (s, now) => instant(s) && Date.parse(s) <= now && now - Date.parse(s) <= 3600000

// Deliberately small grammar: weekday clauses, inclusive weekday ranges, or
// explicit full dates, each with parenthesized HH:mm times. Unknown suffixes,
// holiday exceptions, date-only periods and bare times remain held.
export function normalizeKopisSessions(guidance, startsOn, endsOn) {
  if (typeof guidance !== 'string' || guidance.length > 4000 || !validDay(startsOn) || !validDay(endsOn)
    || endsOn < startsOn || Date.parse(endsOn) - Date.parse(startsOn) > 365 * dayMs) throw Error('SESSIONS_UNVERIFIED')
  const text = guidance.trim(), sessions = new Map(), selectors = new Set()
  const clause = /\s*((?:[일월화수목금토]요일\s*(?:~\s*[일월화수목금토]요일)?)|(?:\d{4}[.-]\d{2}[.-]\d{2}))\s*\((\d{2}:\d{2}(?:\s*,\s*\d{2}:\d{2})*)\)\s*/y
  let offset = 0
  while (offset < text.length) {
    clause.lastIndex = offset
    const match = clause.exec(text)
    if (!match) throw Error('SESSIONS_UNVERIFIED')
    offset = clause.lastIndex
    const selector = match[1].replace(/\s/g, ''), times = match[2].split(',').map(s => s.trim())
    if (times.some(s => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) || new Set(times).size !== times.length
      || selectors.has(selector)) throw Error('SESSIONS_UNVERIFIED')
    selectors.add(selector)
    let dates
    if (/^\d/.test(selector)) {
      const date = selector.replaceAll('.', '-')
      if (!validDay(date) || date < startsOn || date > endsOn) throw Error('SESSIONS_UNVERIFIED')
      dates = [date]
    } else {
      const range = selector.split('~').map(s => weekdays.indexOf(s[0]))
      // A descending range could mean either wrapping or an input error.
      if (range.length === 2 && range[1] < range[0]) throw Error('SESSIONS_UNVERIFIED')
      dates = []
      for (let ms = Date.parse(startsOn); ms <= Date.parse(endsOn); ms += dayMs) {
        const date = new Date(ms), weekday = (date.getUTCDay() + 6) % 7
        if (range.length === 1 ? weekday === range[0] : weekday >= range[0] && weekday <= range[1]) dates.push(date.toISOString().slice(0, 10))
      }
      if (!dates.length) throw Error('SESSIONS_UNVERIFIED')
    }
    for (const date of dates) for (const time of times) {
      const at = `${date}T${time}:00+09:00`
      if (sessions.has(at) || sessions.size >= 1000) throw Error('SESSIONS_UNVERIFIED')
      sessions.set(at, { label: `${date} ${time}`, starts_on: date, starts_at: at })
    }
    if (offset < text.length) {
      if (text[offset] !== ',') throw Error('SESSIONS_UNVERIFIED')
      offset++
      if (!text.slice(offset).trim()) throw Error('SESSIONS_UNVERIFIED')
    }
  }
  if (!sessions.size) throw Error('SESSIONS_UNVERIFIED')
  return [...sessions.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

// Context is a current read of the complete catalog and existing identity
// approvals, never a guessed identity or an approval inferred from a credit.
export function linkKopisCast(cast, { catalog = [], approvals = [] } = {}) {
  const reasons = [], credits = [], names = new Map(), ids = new Map()
  if (!Array.isArray(catalog) || !Array.isArray(approvals)) throw Error('ARTIST_CONTEXT_INVALID')
  for (const band of catalog) {
    if (!band || !uuid.test(band.id ?? '') || typeof band.name !== 'string' || !band.name.trim() || !Array.isArray(band.aliases)
      || band.aliases.some(s => typeof s !== 'string') || ids.has(band.id)) throw Error('ARTIST_CONTEXT_INVALID')
    ids.set(band.id, band)
    for (const name of new Set([band.name, ...band.aliases].map(nameKey))) names.set(name, [...(names.get(name) ?? []), band])
  }
  if (approvals.some(a => typeof a?.identity_key !== 'string' || !a.identity_key.length || a.identity_key.length > 200
    || /\s/.test(a.identity_key) || !uuid.test(a.band_id ?? ''))) throw Error('ARTIST_CONTEXT_INVALID')
  const raw = typeof cast === 'string' ? [...new Set(cast.split(/[,，\n]/).map(s => s.normalize('NFKC').trim()).filter(Boolean))] : []
  if (!raw.length) reasons.push('CAST_MISSING')
  for (const name of raw) {
    const matches = names.get(nameKey(name)) ?? [], band = matches.length === 1 ? matches[0] : null
    const approved = band && band.curation_status === 'approved' && Boolean(band.country_code)
      && approvals.filter(a => a.band_id === band.id).length === 1
    const approval = approved ? approvals.find(a => a.band_id === band.id) : null
    const uniqueIdentity = approval && approvals.filter(a => a.identity_key === approval.identity_key).length === 1
    if (!uniqueIdentity || name.length > 200) {
      reasons.push(matches.length > 1 ? 'ARTIST_AMBIGUOUS' : 'ARTIST_OR_GENRE_UNVERIFIED')
      credits.push({ name, key: null, band_id: null })
    } else credits.push({ name, key: approval.identity_key, band_id: band.id })
  }
  return { credits, reasons: [...new Set(reasons)],
    artistKeys: [...new Set(credits.map(c => c.key).filter(Boolean))], bandIds: [...new Set(credits.map(c => c.band_id).filter(Boolean))] }
}

export function parseKopisApiFacts(xml, expectedId, { observedAt, now = Date.now(), catalog = [], approvals = [], sourceUse = null, previous = null } = {}) {
  if (!fresh(observedAt, now)) throw Error('API_OBSERVATION_REQUIRED')
  // Reuse the strict XML, source-ID, genre, country and date validation.
  const row = parseKopis(xml, expectedId), p = row.payload
  const document = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  const field = tag => [...document.querySelector('db').children].find(e => e.tagName === tag)?.textContent.trim() ?? ''
  const guidance = field('dtguidance'), state = field('prfstate'), reasons = []
  if (!['공연예정', '공연중'].includes(state)) reasons.push('CANCELLED_OR_UNKNOWN')
  p.cancelled = ['공연예정', '공연중'].includes(state) ? false : state === '공연취소' ? true : null
  if (p.country_code !== 'KR') reasons.push('KOREA_VENUE_UNVERIFIED')
  if (p.ends_on < new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })) reasons.push('DATE_UNVERIFIED_OR_PAST')
  try { p.sessions = normalizeKopisSessions(guidance, p.starts_on, p.ends_on) }
  catch { reasons.push('SESSIONS_UNVERIFIED') }
  const lineup = linkKopisCast(field('prfcast'), { catalog, approvals })
  reasons.push(...lineup.reasons)
  p.discovered_artists = lineup.credits.map(c => ({ ...c, source_url: row.source_url }))
  p.artist_keys = lineup.artistKeys; p.band_ids = lineup.bandIds
  // No external product URL or optional provider becomes a publication input.
  p.booking_links = []; p.ticket.booking_url = null; p.ticket_evidence = []
  p.initial_import = true
  p.sources[0].verified_at = observedAt
  p.api_observation = { provider: 'kopis', id: expectedId, observed_at: observedAt, guidance, state, cast: field('prfcast') }
  // Source-use review is deployment-level configuration, not an AI-authored
  // per-event review plan. Missing configuration holds the proposed release.
  let permitted = false
  try {
    const basis = new URL(sourceUse?.basis_url)
    permitted = basis.protocol === 'https:' && ['kopis.or.kr', 'www.kopis.or.kr'].includes(basis.hostname)
      && !basis.username && !basis.password && !basis.port && sourceUse.facts_only === true
      && sourceUse.source === 'kopis' && instant(sourceUse.verified_at) && Date.parse(sourceUse.verified_at) <= now
  } catch { /* Missing or invalid source-use configuration is a hold. */ }
  if (!permitted) reasons.push('SOURCE_USE_UNVERIFIED')
  else p.source_use = { source: 'kopis', facts_only: true, basis_url: sourceUse.basis_url, verified_at: sourceUse.verified_at }
  if (previous) {
    if (previous.source_url !== row.source_url || previous.status !== 'pending' || previous.automation_blocked !== false) reasons.push('ADMIN_OVERRIDE_OR_CONTEXT_CHANGED')
    reasons.push(...factRegressionReasons(previous.payload, p))
    if ((previous.payload.artist_keys ?? []).some(k => !p.artist_keys.includes(k))
      || (previous.payload.band_ids ?? []).some(id => !p.band_ids.includes(id))) reasons.push('ARTIST_LINK_REMOVAL_REQUIRES_REVIEW')
  }
  p.review_reasons = [...new Set(reasons)]
  row.content_hash = createHash('sha256').update(JSON.stringify(p)).digest('hex')
  return { ...row, api_first_preview: true, proposed_contract_ready: p.review_reasons.length === 0 }
}
