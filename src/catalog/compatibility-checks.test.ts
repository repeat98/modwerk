import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import metadata from './native-metadata.json'
import committed from './compatibility-checks.json'
import pairs from './compatibility-pairs.json'
import { compactChecks, passingPairs, recordedCheck, selectionKey, type CompactChecks, type NativeChecks } from './compatibility-checks'
const native = metadata as NativeChecks
describe('compact compatibility checks', () => {
  it('matches the committed file, so the site ships the current native record', () => {
    expect(JSON.stringify(committed) + '\n').toBe(readFileSync(new URL('./compatibility-checks.json', import.meta.url), 'utf8'))
    expect(committed).toEqual(compactChecks(native))
  })
  const compact = compactChecks(native), checked = new Set(compact.checked)
  it('lists exactly the module pairs the full checks record as passing', () => {
    const expected = compact.modules.flatMap((left, index) => compact.modules.slice(index + 1)
      .filter(right => recordedCheck(compact, [left, right], checked)?.length === 0).map(right => selectionKey([left, right]))).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(passingPairs(compact)).toEqual(expected)
    expect(pairs).toEqual({ revision: compact.revision, passing: expected })
  })
  const records = Object.entries(native.checks)
  // Keep every recorded selection/order assertion within the per-test CPU limit.
  for (let shard = 0; shard < 16; shard++) {
    it(`answers recorded selections and their notes in either id order (group ${shard + 1}/16)`, () => {
      expect(compact.checked.length).toBe(records.length)
      for (let index = shard; index < records.length; index += 16) {
        const [key, notes] = records[index]
        const ids = key.split('+')
        expect(recordedCheck(compact, ids, checked)).toEqual(notes)
        expect(recordedCheck(compact, [...ids].reverse(), checked)).toEqual(notes)
      }
    })
  }
  it('leaves unknown and unrecorded selections unchecked', () => {
    expect(recordedCheck(compact, ['unknown-module'], checked)).toBeUndefined()
    expect(recordedCheck(compact, compact.modules, checked)).toBeUndefined()
    const unrecorded = ['midi-scenes', 'spectrum', 'vector'].filter(id => compact.modules.includes(id))
    expect(unrecorded.length).toBe(3)
    expect(native.checks[unrecorded.join('+')]).toBeUndefined()
    expect(recordedCheck(compact, unrecorded, checked)).toBeUndefined()
  })
  it('keeps recorded problems by key and rejects malformed records', () => {
    const compact: CompactChecks = compactChecks({ revision: 'r', checks: { a: [], 'a+b': ['b needs a cave'], b: [] } })
    expect(compact).toEqual({ schemaVersion: 1, revision: 'r', modules: ['a', 'b'], checked: [1, 2, 3], problems: { 'a+b': ['b needs a cave'] } })
    expect(recordedCheck(compact, ['b', 'a'])).toEqual(['b needs a cave'])
    expect(recordedCheck(compact, ['a'])).toEqual([])
    expect(() => compactChecks({ revision: 'r', checks: { 'b+a': [] } })).toThrow('sorted')
    expect(() => compactChecks({ revision: 'r', checks: { 'a+a': [] } })).toThrow('sorted')
  })
})
