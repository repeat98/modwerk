import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ error: 'Analog BD boot payloads overlap or exceed reserved memory.' }))
vi.mock('../src/engine/static-compose.ts', () => ({ planStaticOs: async () => ({ menus: { writes: [] }, dsp: { writes: [], layouts: [] }, logging: { writes: [], chained: [] }, platform: [] }) }))
vi.mock('../src/engine/compose-os.ts', () => ({ composeOs: async () => { throw new Error(state.error) } }))
vi.mock('../src/engine/analog-bd.ts', () => ({ composeAnalogBd: async (_original, image) => ({ bytes: image }) }))
vi.mock('../src/engine/os-patches.ts', () => ({ OS_LOAD_ADDRESS: 0x40000400, applyGuardedOsWrites: async original => original.slice() }))
import { compareSelection } from './native-comparison.mjs'
const original = Uint8Array.of(1, 2, 3, 4)
const hash = createHash('sha256').update(original).digest('hex')
const proof = { moduleIds: ['analog-bassdrum'], bytes: 8, maskedOsSha256: hash, osSha256: hash }
beforeEach(() => { state.error = 'Analog BD boot payloads overlap or exceed reserved memory.' })
it('retains the guarded browser refusal only after native module-owned bytes match', async () => {
  expect(await compareSelection(original, proof, {})).toEqual({ verdict: 'masked', browserPlatformRefused: state.error })
})
it('still rejects mismatched module-owned bytes in a logger-limited selection', async () => {
  expect(await compareSelection(original, { ...proof, maskedOsSha256: '0'.repeat(64) }, {})).toEqual({ failure: 'the module-owned image differs from native outside the platform writes' })
})
it('rejects other errors and the same error outside Analog BD', async () => {
  state.error = 'unresolved runtime relocation'
  expect((await compareSelection(original, proof, {})).failure).toContain(state.error)
  state.error = 'Analog BD boot payloads overlap or exceed reserved memory.'
  expect((await compareSelection(original, { ...proof, moduleIds: ['poly8'] }, {})).failure).toContain('native builds it but the browser refused')
})
