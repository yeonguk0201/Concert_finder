import { artistQuery, mbidPattern, musicbrainzArtist, relevantArtists } from './musicbrainz-data.mjs'

export function createArtistSearchHandler({ authenticateUser, cache, importArtist, loadBand, fetcher = fetch }) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    try {
      let body
      try { const text = await request.text(); if (text.length > 2000) return reply(400, { error: 'INVALID_QUERY' }); body = JSON.parse(text) } catch { return reply(400, { error: 'INVALID_QUERY' }) }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'INVALID_QUERY' })
      const importing = body.action === 'import'
      if (!importing && body.action !== 'search') return reply(400, { error: 'INVALID_QUERY' })
      if (importing && (!token || !await authenticateUser(token))) return reply(401, { error: 'LOGIN_REQUIRED' })
      if (importing ? !mbidPattern.test(body.id ?? '') : typeof body.query !== 'string' || body.query.trim().length < 2 || body.query.length > 100) return reply(400, { error: 'INVALID_QUERY' })
      const term = importing ? `id:${body.id}` : `query:v3:${body.query.trim().normalize('NFKC').toLowerCase()}`
      let result = await cache('get', term)
      if (!result) {
        if (!await cache('reserve', term)) return reply(429, { error: 'SEARCH_BUSY' })
        const url = importing ? `https://musicbrainz.org/ws/2/artist/${body.id}?inc=aliases+tags&fmt=json` : artistQuery(body.query.trim())
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'EncoreArtistSearch/0.3 (https://github.com/yeonguk0201/concert-finder)', Accept: 'application/json' } })
        if (!response.ok) return reply(503, { error: 'ARTIST_PROVIDER_UNAVAILABLE' })
        if (Number(response.headers.get('content-length')) > 2000000) throw new Error('RESPONSE_TOO_LARGE')
        // Bound the stream even when Content-Length is absent.
        const reader = response.body.getReader(), chunks = []; let bytes = 0
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 2000000) throw new Error('RESPONSE_TOO_LARGE'); chunks.push(value) }
        } finally { await reader.cancel() }
        const all = new Uint8Array(bytes); let offset = 0
        for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all))
        result = (importing ? [data] : data.artists ?? []).slice(0, 25).map(musicbrainzArtist).filter(Boolean)
        if (importing && (result.length !== 1 || result[0].key !== `mb:${body.id}`)) throw new Error('INVALID_IDENTITY')
        await cache('store', term, result)
      }
      if (importing) {
        if (result.length !== 1 || !result[0].country) return reply(422, { error: 'COUNTRY_REQUIRED' })
        const bandId = await importArtist(result[0])
        if (!bandId) return reply(409, { error: 'IDENTITY_CONFLICT' })
        return reply(200, { band_id: bandId, band: await loadBand(bandId) })
      }
      return reply(200, { artists: relevantArtists(result, body.query.trim()) })
    } catch { return reply(503, { error: 'ARTIST_SEARCH_FAILED' }) }
  }
}
