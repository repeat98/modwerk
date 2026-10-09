import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import release from '../../sdk/octabam/modules/everb/octamod.module.json'
import capture from '../../sdk/octabam/modules/everb/media/capture.json'
import performance from '../../sdk/octabam/modules/everb/evidence/performance.json'
import baseline from '../../sdk/module-qualification-baseline.json'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication } from './module-contract'
import { requireModuleResourceImpact } from './resource-impact'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'
import { defaultChoosers } from '../engine/choosers'
import chooserMetadata from '../engine/assets/chooser-metadata.json'

const folder = resolve('sdk/octabam/modules/everb')

describe('E-Verb experimental release', () => {
  it('publishes the exact owner-reported source and image through the shared catalog', async () => {
    const document = parseModuleDocument(release)
    expect(document.tests.hardwareStatus).toBe('reported')
    expect(document.tests.qualification?.hardware).toMatchObject({ kind: 'functional', model: 'MKII', tester: 'repeat98' })
    expect(document.tests.qualification?.imageSha256).toBe(capture.imageSha256)
    expect(() => requireModuleQualificationForPublication(document)).not.toThrow()
    await expect(requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).resolves.toBe('qualified')
    expect(MODULES.some(module => module.id === document.id && module.version === document.version)).toBe(true)
    expect(() => resolveSelection([document.id])).not.toThrow()
    const menus = defaultChoosers([document.id])
    expect(menus.fx1).toEqual(chooserMetadata.stockFx1)
    expect(menus.fx2).toEqual([...chooserMetadata.stockFx2.filter(key => !['SPRING REV', 'DARK REV'].includes(key)), 'EVERB'])
  })

  it('carries a complete tutorial, gauges and real monochrome captures of this version', async () => {
    const document = parseModuleDocument(release)
    expect(() => requireModuleUiForPublication(document)).not.toThrow()
    expect(() => requireModuleResourceImpact(document)).not.toThrow()
    requireCompleteReadme(document, await readFile(resolve(folder, 'README.md'), 'utf8'))
    expect(capture.moduleId).toBe(document.id)
    expect(capture.moduleVersion).toBe(document.version)
    // The captures are bound to this exact native source: any source change needs a new capture.
    expect(capture.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(capture.stockOs.mainOsSha256).toMatch(/^[a-f0-9]{64}$/)
    for (const media of document.media) {
      const bytes = await readFile(resolve(folder, media.path))
      requireMonochromePng(bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.screenshots[media.path.slice('media/'.length) as keyof typeof capture.screenshots])
      expect(media.otUi?.moduleVersion).toBe(document.version)
      expect(media.otUi?.imageSha256).toBe(capture.imageSha256)
    }
  })

  it('keeps its performance record on this version (npm run perf:audit -- check judges it)', () => {
    expect(performance.module).toBe(release.id)
    expect(performance.version).toBe(release.version)
    expect(performance.stress.clobbers).toBe(0)
    expect(performance.stress.hangs).toBe(0)
  })
})
