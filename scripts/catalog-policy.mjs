// Reviewed identities, independent of nationality. Unknown artists remain review-only.
export const artists = [
  { key: 'mcr', name: 'My Chemical Romance', aliases: ['마이 케미컬 로맨스', 'MCR'], country: 'US', genre: '얼터너티브 록', evidence: 'https://ualive.com/concerts/397' },
  { key: 'radwimps', name: 'RADWIMPS', aliases: ['래드윔프스', '라드윔프스'], country: 'JP', genre: '록 밴드', evidence: 'https://radwimps.jp/biography/' },
  { key: 'oneokrock', name: 'ONE OK ROCK', aliases: ['원오크록', '원오케이락'], country: 'JP', genre: '록 밴드', evidence: 'https://www.oneokrock.com/en/about/' },
  ...[
    ['soran', 'SORAN', '소란', 'band_soran'],
    ['thornapple', 'THORNAPPLE', '쏜애플', 'thornapple_official'],
    ['surl', 'SURL', '설', 'surlofficial'],
    ['touched', 'TOUCHED', '터치드', 'touched_official'],
    ['ydbb', 'YdBB', '유다빈밴드', 'yudabinband'],
  ].map(([key, name, alias, handle]) => ({ key, name, aliases: [alias], country: 'KR', genre: '밴드', evidence: 'https://www.mpmg.co.kr/', profile: `https://www.instagram.com/${handle}` })),
]
export const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/[\s·._-]/g, '')
export function matchArtist(name) {
  const matches = artists.filter(a => [a.name, ...a.aliases].some(n => normalizeName(n) === normalizeName(name)))
  return matches.length === 1 ? matches[0] : null
}
export function matchProfile(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.instagram.com') return null
    return artists.find(a => a.profile && new URL(a.profile).pathname.replace(/\/$/, '') === parsed.pathname.replace(/\/$/, '')) ?? null
  } catch { return null }
}
export function artworkUrl(value, source) {
  try {
    const url = new URL(value, source)
    const allowed = { 'ualive.com': ['resource.ualive.com'], 'www.mintpaper.co.kr': ['mintpaper.s3.ap-northeast-2.amazonaws.com'] }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !allowed[new URL(source).hostname]?.includes(url.hostname) || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
export function artwork(value, source, reason) {
  const url = artworkUrl(value, source)
  // Discovery does not grant reuse rights. Operators must approve external display.
  return url ? { url, source_url: source, selection_reason: reason, display_approved: false } : null
}
export async function validateArtwork(image, fetcher = fetch) {
  if (!image || !artworkUrl(image.url, image.source_url)) return null
  try {
    const response = await fetcher(image.url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) })
    const size = Number(response.headers.get('content-length'))
    if (!response.ok || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !Number.isFinite(size) || size <= 0 || size > 8000000) return null
    return { ...image, checked_at: new Date().toISOString(), content_type: response.headers.get('content-type'), byte_length: size }
  } catch { return null }
}
