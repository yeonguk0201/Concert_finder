import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileEventKey, profileStateStore } from '../scripts/artist-profile-state.mjs'

const event = () => ({ schemaVersion: 1, runId: '10000000-0000-4000-8000-000000000001',
  bandId: 'dcb90080-9164-478b-a728-b0f0172e2db0', musicBrainzId: '4561aee5-6cf6-41a6-9b7b-f7be15a00a65',
  sourceVersion: '2026-10-21T21:34:52.658091Z', checkedAt: '2026-11-18T14:00:00Z', attempt: 1,
  status: 'candidate', sources: [{ url: 'https://musicbrainz.org/artist/4561aee5-6cf6-41a6-9b7b-f7be15a00a65', checkedAt: '2026-11-18T14:00:00Z', useBasis: 'identity metadata' }],
  retry: { count: 0, nextAt: null }, application: { status: 'not_attempted' }, candidate: { bio: 'Example' } })
function fake({ publicBucket = false, corrupt = false, loseUploadReply = false } = {}) {
  const objects = new Map([['kopis/current.json.gz', Buffer.from('protected')]])
  const client = { storage: {
    getBucket: async () => ({ data: { id: 'concert-scheduler-state', public: publicBucket } }),
    from: () => ({ upload: async (key, bytes, options) => {
      assert.equal(options.upsert, false)
      if (objects.has(key)) return { error: { statusCode: '409' } }
      objects.set(key, bytes); return loseUploadReply ? { error: { statusCode: '503' } } : {}
    }, download: async key => objects.has(key) ? { data: new Blob([corrupt ? 'corrupt' : objects.get(key)]) } : { error: {} } }),
  } }
  return { objects, store: profileStateStore(client) }
}
test('concurrent exact retries share one immutable event; another attempt preserves history and KOPIS', async () => {
  const { objects, store } = fake(), e = event()
  const receipts = await Promise.all([store.persist(e), store.persist(e)])
  assert.deepEqual(receipts[0], receipts[1]); assert.equal(objects.size, 2)
  assert.deepEqual(await store.read(e), e)
  await assert.rejects(store.persist({ ...e, status: 'held' }), /PROFILE_ATTEMPT_CONFLICT/)
  await store.persist({ ...e, attempt: 2, status: 'held', retry: { count: 1, nextAt: null } })
  assert.equal(objects.size, 3); assert.equal(objects.get('kopis/current.json.gz').toString(), 'protected')
  assert.equal((await store.read(e)).status, 'candidate')
})
test('uncertain upload is successful only after exact readback', async () => {
  assert.equal((await fake({ loseUploadReply: true }).store.persist(event())).readbackVerified, true)
  await assert.rejects(fake({ corrupt: true }).store.persist(event()), /PROFILE_ATTEMPT_CONFLICT/)
})
test('public buckets, path injection, missing evidence and unauthorized approval fail closed', async () => {
  await assert.rejects(fake({ publicBucket: true }).store.persist(event()), /PROFILE_PRIVATE_BUCKET_REQUIRED/)
  for (const changes of [{ runId: '../kopis' }, { sources: [] }, { sourceVersion: '' }, { status: 'approved' }, { application: { status: 'applied' } }]) {
    assert.throws(() => profileEventKey({ ...event(), ...changes }), /PROFILE_EVENT_INVALID/)
  }
})
