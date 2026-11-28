import { describe, expect, it, vi } from 'vitest'
import { publishedManifest } from './published-octatrack.fixture'

vi.mock('./octatrack-publication.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('./octatrack-publication.ts')>()
  return { ...actual, publishedBinding: { ...actual.publishedBinding, identity: 'f'.repeat(64), variants: {}, dspFeatures: 24 } }
})
import { BASE_DSP_FEATURES, BaseUpdateRequired, createRuntimeCatalogue, ModuleSetError } from './module-set'

const target = { name: 'Processor reader', moduleIds: ['everb'] }
const empty = { name: '', moduleIds: [], removedStockFx: [] }
const caps = { abi: 10, features: 7 | 128, maxSites: 128, maxCopies: 128 }
const reader = (requires = 16) => createRuntimeCatalogue({ packages: [{
  ...publishedManifest.packages.find(row => row.id === 'everb')!,
  abi: 10, sites: 0, copies: 0, fills: 0, requires, claims: 0, entries: 1, requiredBase: 'f'.repeat(64),
}] })

describe('published Base DSP services', () => {
  it('admits a returning-service consumer only on the matching published Base', () => {
    expect(BASE_DSP_FEATURES).toBe(24)
    expect(reader().review(target, empty, caps, 'f'.repeat(64)).problem).toBeUndefined()
    const problem = reader().review(target, empty, caps, 'b'.repeat(64)).problem
    expect(problem).toBeInstanceOf(BaseUpdateRequired)
  })
  it('rejects requirements outside the compiled Base service mask before a transfer', () => {
    expect(() => reader(32)).toThrow(ModuleSetError)
    expect(() => reader(24)).toThrow(ModuleSetError)
  })
})
