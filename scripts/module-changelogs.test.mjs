import { expect, it } from 'vitest'
import { firstReleaseProblem } from './module-changelogs.mjs'

it('keeps a module new to the library to one entry, and lets a published module keep its history', () => {
  // Shapes from #1215 and #1222: a first library release that still listed 0.1.0, which never reached players.
  const notes = { 'threshold-slices': [{ version: '0.2.0' }, { version: '0.1.0' }], euclid: [{ version: '0.3.0' }, { version: '0.2.0' }], tiempos: [{ version: '0.1.0' }] }
  expect(firstReleaseProblem(notes, id => id !== 'euclid')).toMatch(/^threshold-slices is new to the library.*one entry, for v0\.2\.0.*Fold the notes of v0\.1\.0 into it/)
  expect(firstReleaseProblem(notes, () => false)).toBe(null)
  expect(firstReleaseProblem({ tiempos: notes.tiempos }, () => true)).toBe(null)
})
