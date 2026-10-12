import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import source from '../../sdk/octabam/modules/synth/octamod.module.json'
import capture from '../../sdk/octabam/modules/synth/media/capture.json'
import baseline from '../../sdk/module-qualification-baseline.json'
import approval from '../../sdk/synth-build-approval.json'
import comparison from '../../sdk/native-comparisons/synth.json'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication } from './module-contract'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'

const folder = resolve('sdk/octabam/modules/synth')

describe('FM Synth 0.1.5 (octatrick 2.12 engine, 2.13 quantizer)', () => {
  it('publishes through measured cycles, exact memory and the attributed hardware report of this exact source and image', async () => {
    const document = parseModuleDocument(source)
    const q = document.tests.qualification!
    expect(q).toBeDefined()
    expect(document.tests.releaseWaiver).toBeUndefined()
    expect(() => requireModuleUiForPublication(document)).not.toThrow()
    expect(() => requireModuleQualificationForPublication(document)).not.toThrow()
    expect(q.moduleVersion).toBe(document.version)
    expect(q.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(q.imageSha256).toBe(capture.imageSha256)
    expect(q.cycles.every(c => c.maxConfiguration <= c.budget)).toBe(true)
    expect(await requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).toBe('qualified')
    // The owner's update approval stays bound to the version it named; it never covers this one.
    expect(approval.version).not.toBe(document.version)
    expect(comparison.moduleVersion).toBe(document.version)
    expect(comparison.moduleSourceSha256).toBe(q.sourceSha256)
    expect(comparison.summary.mismatches).toBe(0)
    expect(resolveSelection([document.id]).map(module => module.id)).toEqual(['synth'])
    expect(MODULES.some(module => module.id === document.id)).toBe(true)
    for (const mutate of [
      (d: typeof document) => { d.version = '0.1.6-experimental' },
      (d: typeof document) => { d.tests.qualification!.sourceSha256 = 'f'.repeat(64) },
    ]) {
      const changed = structuredClone(document); mutate(changed)
      await expect(requireFolderQualification(folder, changed, parseQualificationBaseline(baseline))).rejects.toThrow()
    }
  })

  it('refuses changed native source under the recorded qualification', async () => {
    const copy = mkdtempSync(resolve(tmpdir(), 'modwerk-synth-release-test.'))
    try {
      cpSync(folder, copy, { recursive: true })
      writeFileSync(resolve(copy, 'manifest.py'), 'raise AssertionError("changed submitted source must never execute")')
      await expect(requireFolderQualification(copy, parseModuleDocument(source), parseQualificationBaseline(baseline))).rejects.toThrow('source SHA-256')
    } finally { rmSync(copy, { recursive: true, force: true }) }
  })

  it('binds real monochrome screenshots and the complete tutorial to this version and source', async () => {
    const document = parseModuleDocument(source)
    expect(capture.moduleVersion).toBe(document.version)
    expect(capture.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    requireCompleteReadme(document, await readFile(resolve(folder, 'README.md'), 'utf8'))
    for (const media of document.media.filter(item => item.otUi)) {
      const bytes = await readFile(resolve(folder, media.path))
      requireMonochromePng(bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.screenshots[media.path.slice('media/'.length) as keyof typeof capture.screenshots])
      expect(media.otUi?.moduleVersion).toBe(document.version)
      expect(media.otUi?.imageSha256).toBe(capture.imageSha256)
    }
  })
})
