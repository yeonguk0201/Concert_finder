import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectionDecision } from '../scripts/collect-concerts-scheduled.mjs'

test('collection fallback respects source policy, recent server attempts, cooldown and clock uncertainty', () => {
  const now = Date.parse('2026-10-22T12:00:00Z'), policy = { collection_enabled: true }
  assert.equal(collectionDecision({ policy, now }), 'collect')
  assert.equal(collectionDecision({ policy: { collection_enabled: false }, now }), 'policy_off')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T11:01:00Z' } }), 'recent_attempt')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T11:00:00Z' } }), 'collect')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T12:01:00Z' } }), 'clock_or_state_unconfirmed')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: 'invalid' } }), 'clock_or_state_unconfirmed')
  assert.equal(collectionDecision({ policy, now, nextAttemptAt: '2026-10-23T12:00:00Z' }), 'cooldown')
})
