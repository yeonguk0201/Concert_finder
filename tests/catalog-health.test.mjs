import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeCatalog } from '../scripts/catalog-health.mjs'

const now = Date.parse('2026-10-20T06:00:00Z')
const ago = minutes => new Date(now - minutes * 60000).toISOString()
function clientFor(policies, runs, fail = false) {
  return { from(table) {
    let rows = table === 'collection_policies' ? policies : runs
    const query = {
      select() { return this },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return this },
      neq(key, value) { rows = rows.filter(row => row[key] !== value); return this },
      order(key) { rows = [...rows].sort((a, b) => (b[key] ?? '').localeCompare(a[key] ?? '')); return this },
      limit(n) { rows = rows.slice(0, n); return this },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: fail && table === 'collection_runs' ? { code: 'READ_FAILED' } : null }).then(resolve, reject) },
    }
    return query
  } }
}
const policy = (source, enabled = true) => ({ source, collection_enabled: enabled })
const run = (source, age, state = 'success') => ({ source, state, created_at: ago(age), started_at: ago(age), finished_at: ago(age - 1) })

test('hourly start gaps alert even when last success is under two hours old; disabled sources stay quiet', async () => {
  const rows = await probeCatalog(clientFor([policy('late'), policy('fresh'), policy('off', false)], [run('late', 90), run('fresh', 60)]), now)
  assert.equal(rows[0].collection_overdue, true)
  assert.equal(rows[0].attention_required, true)
  assert.equal(rows[1].attention_required, false)
  assert.equal(rows[2].attention_required, false)
})

test('source histories do not starve; legacy records cannot hide two consecutive partial failures', async () => {
  const rows = await probeCatalog(clientFor([policy('quiet'), policy('busy')], [
    run('quiet', 5, 'legacy'), run('quiet', 6, 'partial'), run('quiet', 20, 'partial'), run('quiet', 30),
    ...Array.from({ length: 250 }, () => run('busy', 1)),
  ]), now)
  assert.equal(rows[0].last_success, ago(29))
  assert.equal(rows[0].attention_required, true)
  assert.equal(rows[1].attention_required, false)
})

test('missing or invalid timestamps and failed reads never report healthy', async () => {
  const rows = await probeCatalog(clientFor([policy('empty'), policy('invalid')], [{ source: 'invalid', state: 'success', created_at: ago(1), started_at: 'invalid', finished_at: null }]), now)
  assert.ok(rows.every(row => row.attention_required))
  await assert.rejects(probeCatalog(clientFor([policy('error')], [], true), now), /READ_FAILED/)
})
