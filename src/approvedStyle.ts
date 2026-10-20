import type { Band } from './data'

export function artistStyle(band?: Band) {
  if (band?.musicbrainzId === '2c8b5bb2-6110-488d-bc15-abb08379d3c6' || band?.id === 'silicagel') return 'gel'
  if (band?.id === 'wave' || band?.name.toLowerCase() === 'wave to earth') return 'wave'
  if (band?.countryCode === 'JP' || band?.country === '일본') return 'rock'
  return 'gel'
}

/** Each concert keeps its visual identity across cards, detail and reloads. */
export function concertArtworkStyle(id: string) {
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  return (['gel', 'rock', 'wave', 'festival'] as const)[hash % 4]
}
