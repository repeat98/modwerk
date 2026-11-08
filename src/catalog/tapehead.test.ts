import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyImportedFile } from '../../scripts/sdk-imports.mjs'
import manifest from '../../sdk/octabam/modules/tapehead/octamod.module.json'
import capture from '../../sdk/octabam/modules/tapehead/media/capture.json'
import provenance from '../../sdk/imports/tapehead-f890330.json'
import baseline from '../../sdk/approvals/module-qualification-baseline.json'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { parseModuleDocument } from './module-contract'
import { isModuleAvailable } from './availability'
import { moduleBuildPending } from './build-support'
import { selectionConflicts } from './selection-conflicts'
import { defaultChoosers } from '../engine/choosers'
import requestedProofs from '../engine/assets/tapehead-composition-proofs.json'
import utilityProofs from '../engine/assets/tapehead-utility-proofs.json'

const folder = resolve('sdk/octabam/modules/tapehead')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('published TapeHead evidence', () => {
  it('requires current qualification outside the frozen eleven and preserves the reported hardware limits', async () => {
    const document = parseModuleDocument(manifest)
    expect(baseline.modules.some(module => module.id === 'tapehead')).toBe(false)
    expect(await requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).toBe('qualified')
    expect(document.tests.qualification?.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(document.tests.hardwareStatus).toBe('reported')
    expect(document.tests.qualification?.hardware).toMatchObject({ kind: 'functional', status: 'reported', model: 'MKII', sourceRevision: provenance.revision })
    expect(document.tests.qualification?.hardware).not.toHaveProperty('durationMinutes')
    expect(isModuleAvailable('tapehead')).toBe(true)
    expect(moduleBuildPending('tapehead')).toBe(false)
  })
  it('binds the actual reviewed LCD captures and original-source attribution to their files', () => {
    expect(capture.moduleVersion).toBe(manifest.version)
    expect(capture.sourceRevision).toBe(manifest.tests.evidenceRevision)
    expect(capture.imageSha256).toBe(manifest.tests.qualification.imageSha256)
    expect(capture.manifestSha256).toBe(sha(readFileSync(resolve(folder, 'manifest.py'))))
    for (const screenshot of capture.screenshots) {
      expect(sha(readFileSync(resolve(folder, screenshot.path)))).toBe(screenshot.sha256)
      expect(manifest.access.screenshots).toContain(screenshot.path)
    }
    expect(provenance.authorPins.algorithm.repository).toBe('https://github.com/JClones/JSFXClones')
    expect(sha(readFileSync(resolve(folder, 'JCLONES_NOTICE.md')))).toBe(provenance.authorPins.algorithm.noticeSha256)
    for (const file of provenance.files) verifyImportedFile(resolve('sdk/octabam', file.path), file.vendoredSha256, folder)
    const license = readFileSync(resolve(folder, 'LICENSE'), 'utf8')
    expect(license).toContain('Copyright (c) 2026 JClones')
    expect(license).toContain('Copyright (c) 2026 devilfish707')
  })
  it('offers both effect slots, retains other stock FX2, and explains the native Analog BD refusal', () => {
    const chooser = defaultChoosers(['tapehead'], true)
    expect(chooser.fx1).toContain('TAPEHEAD')
    expect(chooser.fx2).toContain('TAPEHEAD')
    expect(chooser.fx2).not.toContain('SPRING REV')
    expect(chooser.fx2).toContain('DARK REV')
    expect(selectionConflicts(['tapehead'], true)).toEqual([])
    expect(selectionConflicts(['tapehead', 'analog-bassdrum'])).toEqual([])
  })
  it('retains complete native identity and refusal coverage for the new combinations without firmware bytes', () => {
    for (const [proofs, scope, companions, expected] of [
      [requestedProofs.proofs, ['miniverb','tapeecho','euclid','repitch','tapehead','analog-bassdrum','usb-audio-out-tracks-main-cue','quantizer'], ['analog-bassdrum','usb-audio-out-tracks-main-cue','quantizer'], 224],
      [utilityProofs.proofs, ['tapehead','previewvol','cc-map','repitch','quantizer','usb-audio-out-tracks-main-cue'], ['previewvol','cc-map'], 48],
    ] as const) {
      const key = (ids: readonly string[], keep: boolean) => [...ids].sort().join('+') + ':' + keep
      const actual = new Set(proofs.map(proof => key(proof.moduleIds, proof.keepStockFx2)))
      expect(actual.size).toBe(expected)
      expect(proofs).toHaveLength(expected)
      for (let mask = 0; mask < 2 ** scope.length; mask++) for (const keep of [true, false]) {
        const ids = scope.filter((_, bit) => mask >> bit & 1)
        if (ids.includes('tapehead') && companions.some(id => ids.includes(id))) expect(actual.has(key(ids, keep))).toBe(true)
      }
      for (const proof of proofs) {
        if ('error' in proof) expect(proof.error).toMatch(/stock effects only|do not fit|does not fit|chooser list/)
        else {
          expect(proof.sha256).toMatch(/^[a-f0-9]{64}$/)
          expect(proof.firmware.sha256).toMatch(/^[a-f0-9]{64}$/)
          expect(proof).not.toHaveProperty('code')
          expect(proof).not.toHaveProperty('image')
        }
      }
    }
  })
})
