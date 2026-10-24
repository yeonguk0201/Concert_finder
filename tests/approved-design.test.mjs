import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('production uses the approved prototype styles without rewriting their design', async () => {
  for (const [reference, production] of [['preview.css', 'approved-preview.css'], ['flow.css', 'approved-flow.css']]) {
    const [expected, actual] = await Promise.all([
      readFile(new URL(`../public/ui-concepts/${reference}`, import.meta.url), 'utf8'),
      readFile(new URL(`../src/design/${production}`, import.meta.url), 'utf8'),
    ])
    assert.equal(actual.replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'))
  }
})
