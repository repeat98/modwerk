import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import metadata from './native-metadata.json'
import committed from './compatibility-checks.json'
import { compactChecks, recordedCheck, type CompactChecks, type NativeChecks } from './compatibility-checks'
const native = metadata as NativeChecks
describe('compact compatibility checks', () => {
  it('matches the committed file, so the site ships the current native record', () => {
    expect(JSON.stringify(committed) + '\n').toBe(readFileSync(new URL('./compatibility-checks.json', import.meta.url), 'utf8'))
    expect(committed).toEqual(compactChecks(native))
  })
  it('answers exactly the recorded selections with their recorded notes, in any id order', () => {
    const compact = compactChecks(native), checked = new Set(compact.checked)
    expect(compact.checked.length).toBe(Object.keys(native.checks).length)
    for (const [key, notes] of Object.entries(native.checks)) {
      const ids = key.split('+')
      expect(recordedCheck(compact, ids, checked)).toEqual(notes)
      expect(recordedCheck(compact, [...ids].reverse(), checked)).toEqual(notes)
    }
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
