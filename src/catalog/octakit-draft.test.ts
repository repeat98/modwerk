import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import draft from '../../sdk/drafts/octakit/octamod.module.json'
import template from '../../sdk/drafts/octakit/qualification.example.json'
import capture from '../../sdk/drafts/octakit/media/capture.json'
import baseline from '../../sdk/approvals/module-qualification-baseline.json'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication } from './module-contract'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'

const folder = resolve('sdk/drafts/octakit')

describe('OctaKit documented draft', () => {
  it('has actual UI evidence while qualification still rejects the unavailable draft', async () => {
    const document = parseModuleDocument(draft)
    expect(document.author.github).toBe('emuyia')
    expect(document.source?.revision).toBe('8d0ad6f4f82c2efbc10e1c65eefbce0ad1cec4bf')
    expect(document.tests.hardwareStatus).toBe('historical')
    expect(() => requireModuleUiForPublication(document)).not.toThrow()
    expect(() => requireModuleQualificationForPublication(document)).toThrow('worst-case cycles, exact memory and hardware')
    await expect(requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).rejects.toThrow('worst-case cycles, exact memory and hardware')
    expect(MODULES.some(module => module.id === document.id)).toBe(false)
    expect(() => resolveSelection([document.id])).toThrow('Unknown module')
  })

  it('binds real monochrome screenshots and the complete tutorial to this version and source', async () => {
    const document = parseModuleDocument(draft)
    expect(capture.moduleVersion).toBe(document.version)
    expect(capture.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(template.documentation.screenshots).toEqual(document.access!.screenshots)
    // Validate only the template's documentation; never assert its pending hardware/cycles qualify.
    requireCompleteReadme({ id: document.id, tests: { qualification: { documentation: { ...template.documentation, screenshotStyle: 'black-and-white' as const } } } }, await readFile(resolve(folder, 'README.md'), 'utf8'))
    for (const media of document.media) {
      const bytes = await readFile(resolve(folder, media.path))
      requireMonochromePng(bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.screenshots[media.path.slice('media/'.length) as keyof typeof capture.screenshots])
      expect(media.otUi?.moduleVersion).toBe(document.version)
      expect(media.otUi?.imageSha256).toBe(capture.imageSha256)
    }
  })
})
