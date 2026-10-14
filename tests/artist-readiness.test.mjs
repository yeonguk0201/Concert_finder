import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditArtistReadiness, specificEvidence } from '../scripts/artist-readiness.mjs'

test('readiness reuses only matching recent keep evidence, never placeholder sources or changed identities', () => {
  const band={id:'1',name:'Ado',aliases:['아도'],country_code:'JP',musicbrainz_id:'mbid',curation_status:'unreviewed',updated_at:'2026-10-13 08:00:00.123456+00'}
  const row={policy:'jpop-or-rock-v1',bandId:'1',identitySnapshot:{name:'Ado',aliases:['아도'],countryCode:'JP',musicBrainzId:'mbid'},checkedAt:'2026-10-13T09:00:00Z',verdict:'keep',after:{status:'unreviewed',updatedAt:'2026-10-13T08:00:00.123456+00:00'},sources:[{url:'https://www.universal-music.co.jp/ado/biography/'}]}
  const run=(b=band,r=row)=>auditArtistReadiness([b],{rows:[r]},{artists:[]},'2026-10-14T10:00:00Z').rows[0].result
  assert.equal(run(),'reusable_keep')
  assert.equal(run({...band,aliases:['Ado JP']}),'needs_review')
  assert.equal(run({...band,musicbrainz_id:'another'}),'needs_review')
  assert.equal(run({...band,updated_at:'2026-10-14T08:00:00Z'}),'needs_review')
  assert.equal(run(band,{...row,verdict:'hold'}),'needs_review')
  assert.equal(run(band,{...row,checkedAt:'2026-01-01T00:00:00Z'}),'needs_review')
  assert.equal(run(band,{...row,checkedAt:'bad-date'}),'needs_review')
  assert.equal(run(band,{...row,sources:[{url:'https://music.apple.com/us/artist/'}]}),'needs_review')
  assert.equal(run({...band,curation_status:'excluded'}),'preserve_existing')
  assert.equal(specificEvidence('https://example.com/?PgIndex=undefined'),false)
})

test('priority gaps and alias collisions do not merge namesakes or count automatic images as secured', () => {
  const band={id:'1',name:'Same',aliases:['별칭'],country_code:'JP',musicbrainz_id:'one',curation_status:'unreviewed',updated_at:'v1',photo_mode:'auto'}
  const report=auditArtistReadiness([band,{...band,id:'2',musicbrainz_id:'two'}],{rows:[]},{artists:[{name:'Same',musicBrainzId:'missing',category:'jpop'},{name:'Same',musicBrainzId:'one',category:'jpop'}]})
  assert.equal(report.collisions.length,2)
  assert.equal(report.priorities[0].status,'missing')
  assert.equal(report.priorities[0].nameCandidates.length,2)
  assert.equal(report.priorities[1].bandId,'1')
  assert.equal(report.priorities[1].photo.status,'unsecured')
  assert.deepEqual(report.appliedChanges,[])
})
