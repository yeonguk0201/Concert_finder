import type { ArtistProfilePreview } from './artistProfilePreview'
import type { Band } from './data'
export type ArtistProfileContent = Omit<ArtistProfilePreview, 'theme'> & { theme?: ArtistProfilePreview['theme'] }
export function profileMatchesArtist(value: unknown, band: Band): value is ArtistProfileContent {
  if (!value || typeof value !== 'object') return false
  const p=value as ArtistProfileContent
  return p.identity?.bandId===band.id && p.identity.musicBrainzId===band.musicbrainzId
    && typeof p.bio==='string' && typeof p.bioSource?.revisionUrl==='string'
    && typeof p.bioSource.authorsUrl==='string' && Array.isArray(p.music) && Array.isArray(p.live)
}
