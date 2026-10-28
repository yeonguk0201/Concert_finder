import { normalizeName } from './catalog-policy.mjs'

const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

// Read the current catalog, including protected/ambiguous names. Filtering to
// approved rows before matching would hide collisions with excluded artists.
export async function readCollectionArtists(client) {
  const bands = [], seen = new Set()
  for (let offset = 0; offset < 100000; offset += 500) {
    const r = await client.from('bands').select('id,name,aliases,country_code,musicbrainz_id,curation_status')
      .order('id').range(offset, offset + 499)
    if (r.error || !Array.isArray(r.data) || new Set(r.data.map(b => b.id)).size !== r.data.length
      || r.data.some(b => !ID.test(b.id) || seen.has(b.id)
      || typeof b.name !== 'string' || !Array.isArray(b.aliases) || b.aliases.some(a => typeof a !== 'string'))) {
      throw Error('COLLECTION_ARTIST_CONTEXT_UNAVAILABLE')
    }
    for (const b of r.data) { seen.add(b.id); bands.push(b) }
    if (r.data.length < 500) return bands
  }
  throw Error('COLLECTION_ARTIST_CONTEXT_UNAVAILABLE')
}

// A verified catalog alias supplies a canonical lookup query, never a link by
// name alone. The provider must return exactly the same MBID and country.
// Different aliases share the resolver's canonical cache/request budget.
export function createCatalogArtistResolver(bands, resolve) {
  const names = new Map(), ids = new Map()
  for (const b of bands) {
    if (b.musicbrainz_id) {
      const key = `mb:${b.musicbrainz_id}`
      ids.set(key, [...(ids.get(key) ?? []), b])
    }
    for (const name of new Set([b.name, ...b.aliases].map(normalizeName))) names.set(name, [...(names.get(name) ?? []), b])
  }
  const resolver = async name => {
    const local = names.get(normalizeName(name)) ?? []
    if (local.length > 1) throw Error('ARTIST_CATALOG_AMBIGUOUS')
    const known = local[0]
    if (known && (known.curation_status !== 'approved' || !ID.test(known.musicbrainz_id ?? '') || !known.country_code)) {
      throw Error('ARTIST_CATALOG_REVIEW_REQUIRED')
    }
    if (!resolve) throw Error('ARTIST_LOOKUP_SKIPPED')
    const matches = await resolve(known?.name ?? name)
    if (known && (matches.length !== 1 || matches[0].truncated || matches[0].key !== `mb:${known.musicbrainz_id}`
      || matches[0].country !== known.country_code || ids.get(matches[0].key)?.length !== 1)) {
      throw Error('ARTIST_CATALOG_IDENTITY_CONFLICT')
    }
    for (const match of matches) {
      const linked = ids.get(match.key) ?? []
      if (linked.length > 1 || linked.some(b => ['held', 'excluded'].includes(b.curation_status)
        || b.country_code !== match.country)) throw Error('ARTIST_CATALOG_IDENTITY_CONFLICT')
    }
    return matches
  }
  resolver.priority = name => {
    const local = names.get(normalizeName(name)) ?? []
    return local.length === 1 && local[0].curation_status === 'approved' ? 0 : 1
  }
  return resolver
}

// Never copy old keys onto a new lineup by name. Block this source completion
// for explicit review instead. This check also applies to --skip-artist-lookup.
// Reads happen inside the source lease, immediately before each upload attempt.
export async function assertCollectionLinksPreserved(client, batch) {
  const candidates = new Map(batch.candidates.map(row => [row.source_url, row]))
  if (candidates.size !== batch.candidates.length) throw Error('COLLECTION_LINK_CONTEXT_UNAVAILABLE')
  const urls = [...candidates.keys()], review = []
  for (let offset = 0; offset < urls.length; offset += 20) {
    const chunk = urls.slice(offset, offset + 20)
    const r = await client.from('collection_candidates')
      .select('source_url,artist_keys:payload->artist_keys,band_ids:payload->band_ids').in('source_url', chunk)
    if (r.error || !Array.isArray(r.data)) throw Error('COLLECTION_LINK_CONTEXT_UNAVAILABLE')
    const seen = new Set()
    for (const old of r.data) {
      if (!candidates.has(old.source_url) || seen.has(old.source_url)
        || old.artist_keys != null && (!Array.isArray(old.artist_keys) || old.artist_keys.some(k => typeof k !== 'string'))
        || old.band_ids != null && !Array.isArray(old.band_ids)) throw Error('COLLECTION_LINK_CONTEXT_UNAVAILABLE')
      seen.add(old.source_url)
      const incoming = candidates.get(old.source_url).payload.artist_keys
      if (!Array.isArray(incoming) || (old.artist_keys ?? []).some(key => !incoming.includes(key))
        || old.band_ids?.length > (old.artist_keys?.length ?? 0)) review.push({
        source_url: old.source_url, reason: 'ARTIST_LINK_REMOVAL_REQUIRES_REVIEW',
        previous_key_count: old.artist_keys?.length ?? 0, incoming_key_count: Array.isArray(incoming) ? incoming.length : 0,
      })
    }
  }
  if (review.length) {
    const error = Error('COLLECTION_IDENTITY_REGRESSION')
    error.review = review
    throw error
  }
}

// Omit conflicting updates without copying old keys or blocking unrelated
// concerts. Failure entries keep the source partial and visible to monitoring.
export async function quarantineCollectionLinkRegressions(client, batch) {
  try { await assertCollectionLinksPreserved(client, batch) }
  catch (error) {
    if (error.message !== 'COLLECTION_IDENTITY_REGRESSION') throw error
    const blocked = new Set(error.review.map(row => row.source_url))
    batch.identity_link_review = [...(batch.identity_link_review ?? []), ...error.review]
    batch.failures.push(...error.review.map(row => ({ ...row, error: 'COLLECTION_IDENTITY_REGRESSION' })))
    batch.candidates = batch.candidates.filter(row => !blocked.has(row.source_url))
  }
  return batch
}
