import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import source from '../../sdk/octabam/modules/synth/octamod.module.json'
import template from '../../sdk/octabam/modules/synth/qualification.example.json'
import capture from '../../sdk/octabam/modules/synth/media/capture.json'
import baseline from '../../sdk/module-qualification-baseline.json'
import approval from '../../sdk/synth-build-approval.json'
import regressions from '../../sdk/octabam/modules/synth/evidence/regressions.json'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication } from './module-contract'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'

const folder = resolve('sdk/octabam/modules/synth')

describe('FM Synth exact experimental release', () => {
  it('publishes only the exact owner-approved experimental release and keeps unknown measurements visible', async () => {
    const document = parseModuleDocument(source)
    expect(document.tests.hardwareStatus).toBe('reported') // TEST9 (the LFO SETUP names hook back, the slot GAIN fix): the author's MKI report of 1 Nov 2026 (TESTING.md); the TEST7 report of 30 Oct 2026 stays there
    expect(document.resources.processing.value).toBeNull()
    expect(() => requireModuleUiForPublication(document)).not.toThrow()
    expect(() => requireModuleQualificationForPublication(document)).toThrow('worst-case cycles, exact memory and hardware')
    expect(await requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).toBe('owner-approved-update')
    expect(approval.version).toBe(document.version)
    expect(approval.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(regressions.moduleVersion).toBe(document.version)
    for (const regression of Object.values(regressions.releaseRegressions)) {
      expect(regression.status).toBe('passed')
      expect(regression.imageSha256).toBe(regressions.patchedBrowser.mainSha256)
    }
    expect(resolveSelection([document.id]).map(module => module.id)).toEqual(['synth'])
    expect(MODULES.some(module => module.id === document.id)).toBe(true)
    for (const mutate of [
      (d: typeof document) => { d.version = '0.1.3-experimental' },
      (d: typeof document) => { d.tests.hardwareStatus = 'verified' },
    ]) {
      const changed = structuredClone(document); mutate(changed)
      await expect(requireFolderQualification(folder, changed, parseQualificationBaseline(baseline))).rejects.toThrow()
    }
  })

  it('refuses changed native source or regression evidence under the exact source approval', async () => {
    const copy = mkdtempSync(resolve(tmpdir(), 'modwerk-synth-release-test.'))
    try {
      cpSync(folder, copy, { recursive: true })
      const path = resolve(copy, 'evidence/regressions.json'), report = JSON.parse(readFileSync(path, 'utf8'))
      report.releaseRegressions.midi.status = 'failed'
      writeFileSync(path, JSON.stringify(report))
      await expect(requireFolderQualification(copy, parseModuleDocument(source), parseQualificationBaseline(baseline))).rejects.toThrow('exact native source')
      cpSync(resolve(folder, 'evidence/regressions.json'), path)
      writeFileSync(resolve(copy, 'manifest.py'), 'raise AssertionError("changed submitted source must never execute")')
      await expect(requireFolderQualification(copy, parseModuleDocument(source), parseQualificationBaseline(baseline))).rejects.toThrow('exact native source')
    } finally { rmSync(copy, { recursive: true, force: true }) }
  })

  it('binds real monochrome screenshots and the complete tutorial to this version and source', async () => {
    const document = parseModuleDocument(source)
    expect(capture.moduleVersion).toBe(document.version)
    expect(capture.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(template.documentation.screenshots).toEqual(document.access!.screenshots)
    // Validate only the template's documentation; never assert its pending hardware/cycles qualify.
    requireCompleteReadme({ id: document.id, tests: { qualification: { documentation: { ...template.documentation, screenshotStyle: 'black-and-white' as const } } } }, await readFile(resolve(folder, 'README.md'), 'utf8'))
    for (const media of document.media.filter(item => item.otUi)) {
      const bytes = await readFile(resolve(folder, media.path))
      requireMonochromePng(bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.screenshots[media.path.slice('media/'.length) as keyof typeof capture.screenshots])
      expect(media.otUi?.moduleVersion).toBe(document.version)
      expect(media.otUi?.imageSha256).toBe(capture.imageSha256)
    }
  })
})
