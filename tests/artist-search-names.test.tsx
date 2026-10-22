import { test, expect } from 'vitest'
import { matchesArtistSearch } from '../src/artistSearch'
test('stored Korean, English, Japanese and short aliases resolve to one ID without cross-name joins', () => {
  const rows = [{ id: 'bmth', name: 'Bring Me the Horizon', aliases: ['BMTH', '브링 미 더 호라이즌', 'ブリング・ミー・ザ・ホライズン'] },
    { id: 'kenshi', name: '米津玄師', aliases: ['요네즈 켄시', 'Kenshi Yonezu'] }]
  for (const term of ['ＢＭＴＨ', 'bmth', 'Bring Me The Horizon', '브링미더호라이즌', 'ブリング・ミー・ザ・ホライズン']) expect(rows.filter(r => matchesArtistSearch(r, term)).map(r => r.id)).toEqual(['bmth'])
  for (const term of ['米津玄師', 'KenshiYonezu', '요네즈켄시']) expect(rows.filter(r => matchesArtistSearch(r, term)).map(r => r.id)).toEqual(['kenshi'])
  expect(matchesArtistSearch({ name: 'Unrelated', aliases: [] }, 'BMTH')).toBe(false)
  expect(matchesArtistSearch({ name: 'Bring Me', aliases: ['Horizon'] }, 'MeHorizon')).toBe(false)
})
