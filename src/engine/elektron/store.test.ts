import { describe, expect, it } from 'vitest'
import { allocate, checkLock, fromImage, trailer, type Decl, type Lock } from './store.ts'
import { sha } from './bytes.ts'
import vectors from './store-vectors.json'

// Recorded from the builder's earlier storage allocator: the same declarations must keep giving the same layouts,
// notes and lockfile bytes, or owners' projects lose their module data.
describe('module storage', () => {
  it('keeps the recorded layouts, notes and lockfile bytes across a sequence of builds', () => {
    let lock: Lock | null = null
    vectors.steps.forEach((decls, i) => {
      const [next, notes] = allocate(lock, decls as Decl[], 'analog-rytm-mk2', '0.3')
      const want = vectors.out[i]
      expect({ id: next.id, ancestors: next.ancestors, split: next.split, notes, trailerSha: sha(trailer(next)) }).toEqual(want)
      lock = next
    })
    const image = new Uint8Array([1, 2, 3, ...trailer(lock!), 9])
    expect(fromImage(image)).toEqual(lock)
  })
  it('refuses a lockfile made for another machine', () => {
    const [lock] = allocate(null, [], 'analog-four-mk2')
    expect(() => checkLock(lock, 'analog-rytm-mk2')).toThrow('made for the analog-four-mk2')
  })
})
