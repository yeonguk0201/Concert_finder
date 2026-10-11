export const mbidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function musicbrainzArtist(a) {
  if (!a || !mbidPattern.test(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) return null
  return { key: `mb:${a.id}`, name: a.name, aliases: [...new Set((a.aliases ?? []).map(x => x.name).filter(n => typeof n === 'string' && n.length <= 200 && n !== a.name))].slice(0, 50),
    country: /^[A-Z]{2}$/.test(a.country ?? '') ? a.country : null, genre: '장르 미검수', evidence: `https://musicbrainz.org/artist/${a.id}`,
    disambiguation: typeof a.disambiguation === 'string' ? a.disambiguation.slice(0, 500) : '', type: typeof a.type === 'string' ? a.type : '',
    tags: (a.tags ?? []).map(t => t.name).filter(n => typeof n === 'string').slice(0, 20) }
}
export function artistQuery(name) {
  return `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`"${name.replace(/[\\"]/g, '\\$&')}"`)}&fmt=json&limit=25`
}
