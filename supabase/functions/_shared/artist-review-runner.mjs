const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const CHANNEL = /^https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})$/
const codes = new Set(['SERVICE_REQUIRED', 'RUN_EXPIRED', 'LEASE_LOST', 'TARGET_NOT_CLAIMED', 'TARGET_DISABLED',
  'EDIT_CONFLICT', 'MANUAL_DECISION', 'INVALID_RESULT', 'OFFICIAL_EVIDENCE_REQUIRED', 'CHANNEL_EVIDENCE_REQUIRED',
  'CHANNEL_LOCKED', 'CHANNEL_ID_CHANGED', 'CHECKPOINT_CONFLICT', 'RUN_NOT_FOUND'])
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

async function boundedText(stream, max) {
  const reader = stream?.getReader()
  if (!reader) throw new Error('INVALID_BODY')
  const chunks = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) throw new Error('BODY_TOO_LARGE')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

async function authorized(actual, expected) {
  if (!expected || expected.length < 32 || !actual || actual.length > 300) return false
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [a, b] = await Promise.all([digest(actual), digest(expected)])
  const x = new Uint8Array(a), y = new Uint8Array(b); let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// Fetch only deployment-approved official hosts, never arbitrary model URLs or redirects.
export async function verifyReviewSources(result, context, fetcher = fetch) {
  const proofs = [...(result.genre?.decision === 'failed' ? [] : result.genre?.evidence ?? []),
    ...(result.channel?.decision === 'verified' ? result.channel.evidence ?? [] : [])]
  if (proofs.length > 20) throw new Error('INVALID_RESULT')
  const pages = new Map()
  for (const proof of proofs) {
    const url = new URL(proof.url)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
      || !context.sourceHosts.includes(url.hostname) || proof.identityMatched !== true
      || proof.kind !== 'official_artist_page' || typeof proof.excerpt !== 'string'
      || proof.excerpt.length < 10) throw new Error('OFFICIAL_EVIDENCE_REQUIRED')
    if (!pages.has(url.href)) {
      if (pages.size >= 6) throw new Error('INVALID_RESULT')
      const response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'EncoreArtistReview/1.0 (official evidence verification)' } })
      if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get('content-type') ?? '')) throw new Error('SOURCE_UNAVAILABLE')
      const html = (await boundedText(response.body, 800000)).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
      const text = html
        .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'")
      pages.set(url.href, { html, text: normalize(text) })
    }
    const page = pages.get(url.href)
    const names = [context.snapshot.name, ...(context.snapshot.aliases ?? [])].map(normalize).filter(Boolean)
    if (!names.some(name => page.text.includes(name)) || !page.text.includes(normalize(proof.excerpt))) throw new Error('SOURCE_MISMATCH')
    if (result.channel?.decision === 'verified' && (result.channel.evidence ?? []).includes(proof)) {
      if (proof.linkedChannelUrl !== result.channel.url || !CHANNEL.test(result.channel.url)) throw new Error('CHANNEL_EVIDENCE_REQUIRED')
      const links = [...page.html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].replace(/&amp;/g, '&'))
      if (!links.includes(proof.linkedChannelUrl)) throw new Error('CHANNEL_EVIDENCE_REQUIRED')
    }
  }
}

export function createArtistReviewHandler({ secret, rpc, youtubeKey, fetcher = fetch }) {
  const call = async (name, args) => {
    const { data, error } = await rpc(name, args)
    if (error) throw new Error(codes.has(error.message) ? error.message : 'REVIEW_DB_FAILED')
    return data
  }
  return async request => {
    if (!await authorized(request.headers.get('Authorization')?.replace(/^Bearer /, ''), secret)) return reply({ error: 'UNAUTHORIZED' }, 401)
    if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
    try {
      const input = JSON.parse(await boundedText(request.body, 30000))
      if (!UUID.test(input.runId ?? '')) return reply({ error: 'INVALID_BODY' }, 400)
      if (input.action === 'begin' && Object.keys(input).every(k => ['action', 'runId'].includes(k))) {
        return reply(await call('service_claim_artist_review', { request_id: input.runId }))
      }
      if (input.action === 'finish' && Object.keys(input).every(k => ['action', 'runId'].includes(k))) {
        return reply(await call('service_finish_artist_review', { run_id: input.runId }))
      }
      if (input.action === 'close' && Object.keys(input).every(k => ['action', 'runId'].includes(k))) {
        return reply(await call('service_close_artist_review', { run_id: input.runId }))
      }
      if (input.action === 'queue' && (input.afterId === null || UUID.test(input.afterId ?? ''))
        && Object.keys(input).every(k => ['action', 'runId', 'afterId'].includes(k))) {
        return reply({ queue: await call('service_artist_review_queue', { after_id: input.afterId }), notify: false })
      }
      if (input.action === 'notices' && Object.keys(input).every(k => ['action', 'runId', 'acknowledge'].includes(k))
        && (input.acknowledge === undefined || (Array.isArray(input.acknowledge)
          && input.acknowledge.length <= 30 && input.acknowledge.every(id => UUID.test(id))))) {
        const notices = await call('service_artist_review_notices', { acknowledge: input.acknowledge ?? [] })
        return reply({ notify: notices.length > 0, notices })
      }
      if (input.action === 'defer' && UUID.test(input.bandId ?? '') && typeof input.reason === 'string'
        && Object.keys(input).every(k => ['action', 'runId', 'bandId', 'reason'].includes(k))) {
        return reply(await call('service_defer_artist_review', { run_id: input.runId, band_id: input.bandId, reason: input.reason }))
      }
      if (input.action !== 'checkpoint' || !UUID.test(input.bandId ?? '') || !input.expectedVersion || !input.result
        || Object.keys(input).some(k => !['action', 'runId', 'bandId', 'expectedVersion', 'result'].includes(k))) return reply({ error: 'INVALID_BODY' }, 400)
      const context = await call('service_artist_review_context', { run_id: input.runId, band_id: input.bandId })
      if (context.snapshot.version !== input.expectedVersion) throw new Error('EDIT_CONFLICT')
      if (context.checkpoint) {
        return reply(await call('service_checkpoint_artist_review', {
          run_id: input.runId, band_id: input.bandId, expected_version: input.expectedVersion, result: input.result,
        })) // SQL compares the original submission; no repeated research/provider calls.
      }
      await verifyReviewSources(input.result, context, fetcher)
      if (input.result.channel?.decision === 'verified') {
        if (!youtubeKey) throw new Error('YOUTUBE_KEY_REQUIRED')
        const id = CHANNEL.exec(input.result.channel.url)?.[1]
        if (!id) throw new Error('CHANNEL_EVIDENCE_REQUIRED')
        const url = new URL('https://www.googleapis.com/youtube/v3/channels')
        url.search = new URLSearchParams({ part: 'id', id, fields: 'items/id' }).toString()
        // A header avoids embedding a key in URLs, logs, checkpoints or Git.
        const response = await fetcher(url.href, { headers: { 'X-Goog-Api-Key': youtubeKey }, redirect: 'error', signal: AbortSignal.timeout(12000) })
        if (response.status === 429 || response.status >= 500) throw new Error('SOURCE_UNAVAILABLE')
        if (!response.ok) throw new Error('YOUTUBE_ACTION_REQUIRED')
        const data = JSON.parse(await boundedText(response.body, 20000))
        if (!Array.isArray(data.items) || !data.items.some(item => item.id === id)) throw new Error('CHANNEL_NOT_FOUND')
      }
      return reply(await call('service_checkpoint_artist_review', {
        run_id: input.runId, band_id: input.bandId, expected_version: input.expectedVersion, result: input.result,
      }))
    } catch (error) {
      const code = codes.has(error.message) || ['BODY_TOO_LARGE', 'INVALID_RESULT', 'SOURCE_UNAVAILABLE', 'SOURCE_MISMATCH',
        'YOUTUBE_KEY_REQUIRED', 'YOUTUBE_ACTION_REQUIRED', 'CHANNEL_NOT_FOUND', 'REVIEW_DB_FAILED'].includes(error.message)
        ? error.message : ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? 'SOURCE_UNAVAILABLE' : 'REVIEW_REQUEST_FAILED'
      return reply({ error: code }, code === 'BODY_TOO_LARGE' ? 413 : 409)
    }
  }
}
