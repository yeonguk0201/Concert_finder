import type { Band } from './data'

export function artistStyle(band?: Band) {
  if (band?.musicbrainzId === '2c8b5bb2-6110-488d-bc15-abb08379d3c6' || band?.id === 'silicagel') return 'gel'
  if (band?.id === 'wave' || band?.name.toLowerCase() === 'wave to earth') return 'wave'
  if (band?.countryCode === 'JP' || band?.country === '일본') return 'rock'
  return 'gel'
}
