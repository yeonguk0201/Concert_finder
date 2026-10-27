export function normalizeArtistSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, '').trim()
}

// Search stored same-identity aliases; never infer an artist from initials or translation.
export function matchesArtistSearch(artist: { name: string; aliases?: string[] }, query: string) {
  const term = normalizeArtistSearch(query)
  return [artist.name, ...(artist.aliases ?? [])].some(name => normalizeArtistSearch(name).includes(term))
}
