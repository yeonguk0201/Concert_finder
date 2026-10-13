export const mbidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function musicbrainzArtist(a) {
  if (!a || !mbidPattern.test(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) return null
  return { key: `mb:${a.id}`, name: a.name, aliases: [...new Set((a.aliases ?? []).map(x => x.name).filter(n => typeof n === 'string' && n.length <= 200 && n !== a.name))].slice(0, 50),
    country: /^[A-Z]{2}$/.test(a.country ?? '') ? a.country : null, genre: '장르 미검수', evidence: `https://musicbrainz.org/artist/${a.id}`,
    disambiguation: typeof a.disambiguation === 'string' ? a.disambiguation.slice(0, 500) : '', type: typeof a.type === 'string' ? a.type : '',
    tags: (a.tags ?? []).map(t => t.name).filter(n => typeof n === 'string').slice(0, 20), score: Number(a.score) || 0 }
}
const searchName = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim()
export function relevantArtists(artists, query) {
  const term = searchName(query)
  if (!term) return []
  const rank = artist => {
    const name = searchName(artist.name)
    const aliases = artist.aliases.map(searchName)
    if (name === term) return 4
    if (aliases.includes(term)) return 3
    // Short names such as Ado produce many unrelated token/prefix matches.
    if (term.length <= 3) return 0
    if ([name, ...aliases].some(n => ` ${n} `.includes(` ${term} `))) return 2
    if (!term.includes(' ') && [name, ...aliases].some(n => n.startsWith(term))) return 1
    return 0
  }
  return artists.filter(a => a.country && a.country !== 'CN' && ['Person', 'Group'].includes(a.type))
    .map(artist => ({ artist, rank: rank(artist) })).filter(a => a.rank > 0)
    .sort((a, b) => b.rank - a.rank || (b.artist.score ?? 0) - (a.artist.score ?? 0) || a.artist.name.localeCompare(b.artist.name))
    .slice(0, 10).map(a => a.artist)
}
export function artistQuery(name) {
  const escaped = name.replace(/[\\"]/g, '\\$&')
  return `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`(artist:"${escaped}" OR alias:"${escaped}") AND country:* AND -country:CN AND (type:person OR type:group)`)}&fmt=json&limit=25`
}
