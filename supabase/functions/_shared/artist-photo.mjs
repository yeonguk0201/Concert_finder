import { mbidPattern } from './musicbrainz-data.mjs'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, s => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[s]).replace(/\s+/g, ' ').trim().slice(0, 2000) : ''
const claims = (entity, key) => (entity?.claims?.[key] ?? []).filter(c => c.rank !== 'deprecated' && c.mainsnak?.snaktype === 'value').sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'))
export function commonsPhoto(info, identity, wikidata) {
  const metadata = info?.extmetadata ?? {}
  const licenseUrl = (metadata.LicenseUrl?.value ?? '').replace(/^http:\/\//, 'https://').replace(/\/?$/, '/')
  if (!/^https:\/\/creativecommons\.org\/(?:licenses\/by(?:-sa)?\/(?:2\.0|2\.5|3\.0|4\.0)|publicdomain\/(?:zero|mark)\/1\.0)\/$/.test(licenseUrl)) return null
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null
  if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(info.thumburl ?? '')) return null
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(info.descriptionurl ?? '')) return null
  const author = plain(metadata.Artist?.value), license = plain(metadata.LicenseShortName?.value)
  if (!author || !license || metadata.Restrictions?.value) return null
  return { url: info.thumburl, source: info.descriptionurl, author, credit: plain(metadata.Credit?.value), license, licenseUrl,
    identity: `mb:${identity}`, wikidata: `https://www.wikidata.org/wiki/${wikidata}`, retrievedAt: new Date().toISOString() }
}

export function createArtistPhotoHandler({ cache, resolveBand, fetcher = fetch }) {
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    try {
      const text = await request.text()
      if (text.length > 2000) return reply(400, { error: 'INVALID_QUERY' })
      const body = JSON.parse(text)
      if (!body || typeof body !== 'object' || Array.isArray(body) || Boolean(body.id) === Boolean(body.band_id) || typeof (body.id ?? body.band_id) !== 'string' || !mbidPattern.test(body.id ?? body.band_id ?? '')) return reply(400, { error: 'INVALID_QUERY' })
      const id = body.id ?? await resolveBand(body.band_id)
      if (!id) return reply(200, { photo: null })
      if (!mbidPattern.test(id)) throw new Error('INVALID_IDENTITY')
      const key = `photo:v1:${id}`
      const cached = await cache('get', key)
      if (cached) return reply(200, { photo: cached[0] ?? null })
      // Share MusicBrainz's application-wide gate with artist search and import.
      if (!await cache('reserve', key)) return reply(429, { error: 'SEARCH_BUSY' })
      const signal = AbortSignal.timeout(15000)
      const get = async url => {
        const response = await fetcher(url, { redirect: 'error', signal, headers: { 'User-Agent': 'EncoreArtistPhotos/0.3 (https://github.com/yeonguk0201/concert-finder)', Accept: 'application/json' } })
        if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE')
        const reader = response.body.getReader(), chunks = []; let size = 0
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2000000) throw new Error('RESPONSE_TOO_LARGE'); chunks.push(value) }
        } finally { await reader.cancel() }
        const all = new Uint8Array(size); let offset = 0
        for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all))
      }
      const artist = await get(`https://musicbrainz.org/ws/2/artist/${id}?inc=url-rels&fmt=json`)
      if (artist.id !== id) throw new Error('INVALID_IDENTITY')
      const qids = [...new Set((artist.relations ?? []).filter(r => r.type === 'wikidata').map(r => /^https?:\/\/www\.wikidata\.org\/wiki\/(Q[1-9][0-9]*)$/.exec(r.url?.resource ?? '')?.[1]).filter(Boolean))]
      let photo = null
      if (qids.length === 1) {
        const qid = qids[0]
        const data = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`)
        const entity = data.entities?.[qid]
        const reverse = claims(entity, 'P434').map(c => c.mainsnak.datavalue?.value)
        const image = claims(entity, 'P18')[0]?.mainsnak.datavalue?.value
        if ((!reverse.length || reverse.includes(id)) && typeof image === 'string' && image.length <= 300 && /\.(?:jpe?g|png|webp)$/i.test(image)) {
          const params = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${image}`, prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '320', iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl|Restrictions' })
          const commons = await get(`https://commons.wikimedia.org/w/api.php?${params}`)
          photo = commonsPhoto(Object.values(commons.query?.pages ?? {})[0]?.imageinfo?.[0], id, qid)
        }
      }
      // Cache absence too; failures above deliberately never become negative cache entries.
      await cache('store', key, photo ? [photo] : [])
      return reply(200, { photo })
    } catch (error) { return reply(error instanceof SyntaxError ? 400 : 503, { error: error instanceof SyntaxError ? 'INVALID_QUERY' : 'PHOTO_UNAVAILABLE' }) }
  }
}
