import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { baseBoundReport, checkBaseBound } from './base-bound.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const id = digit => digit.repeat(64)
const binding = { identity: id('b') }
const packages = { packages: [
  { id: 'cc-map', version: '0.1.2', base: true, requiredBase: id('b') },
  { id: 'analog-bassdrum', version: '0.1.7', base: true, requiredBase: id('b') },
  { id: 'miniverb', version: '0.2.3' },
] }

describe('base-bound packages', () => {
  it('passes when every base-bound package names the committed base, and ignores the others', () => {
    expect(baseBoundReport({ packages, binding })).toEqual({ problems: [], line: 'Base-bound packages: 2 of 2 name the committed base bbbbbbbb' })
  })
  it('names every package left on the old base, or with none, and the relink', () => {
    const moved = { identity: id('c') }
    const { line, problems } = baseBoundReport({ packages: { packages: [...packages.packages, { id: 'recorder-loop-fix', version: '0.1.0', base: true }] }, binding: moved })
    expect(line).toBe('Base-bound packages: 0 of 3 name the committed base cccccccc')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('cc-map 0.1.2 (bbbbbbbb), analog-bassdrum 0.1.7 (bbbbbbbb), recorder-loop-fix 0.1.0 (no requiredBase) name another base than the committed cccccccc')
    expect(problems[0]).toContain('npm run octatrack:module-packages -- --base-only')
    expect(problems[0]).toContain('lagsBehind')
  })
  it('passes on the committed tree', () => {
    expect(checkBaseBound(root)).toMatch(/^Base-bound packages: (\d+) of \1 name the committed base [0-9a-f]{8}$/)
  })
})
