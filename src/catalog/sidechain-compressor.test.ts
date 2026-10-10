import { describe, expect, it } from 'vitest'
import composition from '../engine/assets/sidechain-composition-proofs.json'
import visibleProofs from '../engine/assets/sidechain-visible-proofs.json'
import analogProofs from '../engine/assets/sidechain-analog-bd-proofs.json'
import { CATALOG_SOURCE } from './modules'
import { checkSelection } from './compatibility'
import { selectionConflicts } from './selection-conflicts'
import { defaultChoosers } from '../engine/choosers'
import { parseModuleDocument, requireModuleQualificationForPublication } from './module-contract'
import manifest from '../../sdk/octabam/modules/sidechain-compressor/octamod.module.json'

const key = (ids: readonly string[], keep: boolean) => [...ids].sort().join('+') + ':' + keep
const visible = ['miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'usb-audio-out-tracks-main-cue', 'quantizer', 'previewvol', 'cc-map']
const suites = [
  { name: 'original eight modules', data: composition, built: 200, scope: ['spectrum', 'modulation', 'character', 'miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'sidechain-compressor'], member: (ids: string[]) => ids.includes('sidechain-compressor'), expected: 512 },
  { name: 'nine visible modules without Analog BD', data: visibleProofs, built: 786, scope: [...visible, 'sidechain-compressor'], member: (ids: string[]) => ids.includes('sidechain-compressor'), expected: 1024 },
  { name: 'Analog BD', data: analogProofs, built: 0, scope: ['analog-bassdrum', ...visible, 'sidechain-compressor'], member: (ids: string[]) => ids.includes('sidechain-compressor') && ids.includes('analog-bassdrum') && [2, 3, 11].includes(ids.length), expected: 22 },
]
const refusalClass = /overruns the region|label formatters do not fit|wide dial hook|chooser list of|not free|past the stock zero run|fits neither the clone window|stock effects only/

describe('Sidechain Compressor native evidence on the shared builder', () => {
  it('covers every selection of each suite, with and without stock FX2, and holds no firmware bytes', () => {
    for (const { name, data, scope, member, expected } of suites) {
      expect(data.schema).toBe(1)
      expect(data.revision).toBe(CATALOG_SOURCE.revision)
      expect(data.staticStock).toBe(true)
      const proofs = data
      const actual = new Set(proofs.proofs.map(proof => key(proof.moduleIds, proof.keepStockFx2)))
      expect(proofs.proofs, name).toHaveLength(expected)
      expect(actual.size, name).toBe(expected)
      for (let mask = 0; mask < 2 ** scope.length; mask++) for (const keep of [true, false]) {
        const ids = scope.filter((_, bit) => mask >> bit & 1)
        expect(actual.has(key(ids, keep)), name + ' ' + key(ids, keep)).toBe(member(ids))
      }
      for (const proof of proofs.proofs) {
        expect(proof).not.toHaveProperty('code'); expect(proof).not.toHaveProperty('image')
        if ('error' in proof) continue
        for (const field of ['sha256', 'osSha256', 'maskedOsSha256', 'appendSha256'] as const) expect(proof[field]).toMatch(/^[a-f0-9]{64}$/)
        // Native has no logger, so without a runtime its image is the OS and nothing else, and no platform write exists to mask.
        if (proof.bytes === 1112560) { expect(proof.osSha256).toBe(proof.sha256); expect(proof.maskedOsSha256).toBe(proof.sha256) }
      }
    }
  })
  it('builds the same menus as the native profiles for every selection', () => {
    for (const { data } of suites.filter(suite => suite.data !== analogProofs)) for (const proof of data.proofs) {
      expect(defaultChoosers(proof.moduleIds, proof.keepStockFx2), key(proof.moduleIds, proof.keepStockFx2)).toEqual({ fx1: proof.menu.fx1, fx2: proof.menu.fx2 })
    }
  })
  it('records which selections native builds and why it refuses the others', () => {
    for (const { name, data, expected, built } of suites) {
      const proofs = data.proofs
      expect(proofs.filter(proof => !('error' in proof)), name).toHaveLength(built)
      expect(proofs.filter(proof => 'error' in proof), name).toHaveLength(expected - built)
      for (const proof of proofs) if ('error' in proof) expect(proof.error).toMatch(refusalClass)
    }
    // Sidechain Compressor beside any one other original module builds in both menu modes.
    for (const other of ['spectrum', 'modulation', 'character', 'miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead']) for (const keep of [true, false]) {
      const proof = composition.proofs.find(proof => key(proof.moduleIds, proof.keepStockFx2) === key(['sidechain-compressor', other], keep))
      expect(proof, other + ' ' + keep).toBeDefined(); expect(proof).not.toHaveProperty('error')
    }
  })
  it('builds beside every other visible module and every pair of them, in both menu modes', () => {
    // The promise made to users: adding it never costs a selection of one or two other modules.
    const smallSets = visibleProofs.proofs.filter(proof => proof.moduleIds.length <= 3)
    expect(smallSets).toHaveLength(2 * (1 + visible.length + visible.length * (visible.length - 1) / 2))
    for (const proof of smallSets) expect(proof, key(proof.moduleIds, proof.keepStockFx2)).not.toHaveProperty('error')
    // Larger selections that fit without it still do, except where the effect menus have no room left for it.
    for (const proof of visibleProofs.proofs) if ('error' in proof && proof.moduleIds.length > 3) expect(proof.error).toMatch(refusalClass)
  })
  it('pins the native image of the module alone, both menu modes', () => {
    const alone = (keep: boolean) => composition.proofs.find(proof => key(proof.moduleIds, proof.keepStockFx2) === key(['sidechain-compressor'], keep))!
    expect(alone(true)).toMatchObject({ bytes: 1112560, sha256: '2816f0bce5aaabfadac6dba9e778dc184b8af3e4a611990d6e6b3e36095bc5eb' })
    expect(alone(false)).toMatchObject({ bytes: 1112560, sha256: '9b6342c28437f026673d07bb8ac3680626f4ee6f89c01637ac3ea01e6ae9c324' })
  })
  it('retains the historical Analog BD refusals without treating them as current limits', () => {
    expect(analogProofs.proofs.every(proof => 'error' in proof)).toBe(true)
    expect(selectionConflicts(['sidechain-compressor', 'analog-bassdrum'])).toEqual([])
    expect(selectionConflicts(['sidechain-compressor'], true)).toEqual([])
  })
  it('keeps MIDI Scenes standalone and records a declaration check for every other selection', () => {
    expect(checkSelection(['sidechain-compressor', 'midi-scenes']).issues.join(' ')).toContain('standalone')
    const others = ['analog-bassdrum', ...visible]
    for (let mask = 0; mask < 2 ** others.length; mask++) {
      const result = checkSelection([...others.filter((_, bit) => mask >> bit & 1), 'sidechain-compressor'])
      expect(result.notes).toEqual([])
    }
  })
  it('carries its own reported hardware evidence and cannot reuse the 0.1.1 waiver', () => {
    const current = () => parseModuleDocument(JSON.parse(JSON.stringify(manifest)))
    expect(() => requireModuleQualificationForPublication(current())).not.toThrow()
    expect(current().tests.hardwareStatus).toBe('reported')
    expect(current().tests.qualification?.hardware).toMatchObject({ kind: 'functional', status: 'reported', model: 'MKI', imageSha256: '2816f0bce5aaabfadac6dba9e778dc184b8af3e4a611990d6e6b3e36095bc5eb' })
    // The pinned image is the one the hardware report names.
    expect(composition.proofs.find(proof => key(proof.moduleIds, proof.keepStockFx2) === key(['sidechain-compressor'], true))!.sha256).toBe(current().tests.qualification!.imageSha256)
    // The owner's 5 October waiver covered 0.1.1 only.
    const waived = current()
    waived.tests.qualification!.hardware = { kind: 'owner-waived', status: 'waived', approvedBy: 'repeat98', approvedOn: '2026-10-05', reason: 'reuse', report: 'evidence/software.json' }
    ;(waived.tests as { hardwareStatus: string }).hardwareStatus = 'historical'
    expect(() => requireModuleQualificationForPublication(waived)).toThrow('hardware-only owner approval covers only')
    // A report for another image or source does not qualify this one.
    const otherImage = current(); otherImage.tests.qualification!.imageSha256 = '0'.repeat(64)
    expect(() => requireModuleQualificationForPublication(otherImage)).toThrow('must match the tested source and image')
    // The sixteen-instance memory accounting must add up.
    const fewer = JSON.parse(JSON.stringify(manifest)); fewer.tests.qualification.memory.maxInstances = 15
    expect(() => parseModuleDocument(fewer)).toThrow('region sums and maximum-instance total')
  })
})
