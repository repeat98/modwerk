import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import release from '../../sdk/octatrack/modules/everb/octamod.module.json'
import capture from '../../sdk/octatrack/modules/everb/media/capture.json'
import performance from '../../sdk/octatrack/modules/everb/evidence/performance.json'
import baseline from '../../sdk/approvals/module-qualification-baseline.json'
import recipes from '../engine/assets/descriptor-recipes.json'
import { parseModuleDocument, requireModuleUiForPublication } from './module-contract'
import { requireModuleResourceImpact } from './resource-impact'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'

const folder = resolve('sdk/octatrack/modules/everb')

describe('E-Verb experimental release', () => {
  it('publishes 0.1.2 as an owner-approved update through the shared catalog, with 0.1.0 hardware evidence only', async () => {
    const document = parseModuleDocument(release)
    // 0.1.1 changed four FX2 descriptor words (#438) and 0.1.2 the ring length (#696); neither has run on hardware.
    // The owner's MKII report is 0.1.0's.
    expect(document.tests.hardwareStatus).toBe('historical')
    expect(document.tests.qualification).toBeUndefined()
    await expect(requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).resolves.toBe('owner-approved-update')
    expect(MODULES.some(module => module.id === document.id && module.version === document.version)).toBe(true)
    expect(() => resolveSelection([document.id])).not.toThrow()
  })

  it('gives every 0..127 knob the three-stop FUNC editor in the shipped descriptor recipe (#438)', () => {
    // P+0x12a is a knob's edit handler. 0x400328e4 makes FUNC + turn stop at 0, 64 and 127; the donor's TIME..LP slots carry a
    // two-stop one (0 and 127), which SIZE, DCY, ABSB and SPD inherited in 0.1.0. A select (REV) keeps the plain editor, 0.
    const recipe = recipes.recipes.find(item => item.id === 'everb')!
    const editor = (slot: number) => recipe.integers.filter(field => field.offset === 0x12a + 4 * slot && field.width === 4).at(-1)?.value
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]) expect(editor(slot), `slot ${slot}`).toBe(0x400328e4)
    expect(editor(8)).toBe(0)
  })

  it('keeps its ring clear of Sidechain Compressor\'s key window on T3 and T7 (#696)', async () => {
    // Sidechain Compressor keeps a cross-core key window in the last 514 words (+$3DFE..) of the bank-track-3 FX2 slots.
    // 0.1.1's ring was modulo 16,384 and wrote it; verify.py's window gate proves the fix on the emulator, this keeps the
    // source from drifting back: every modulo register E-Verb sets is linear or wraps at 15,870 words.
    const asm = await readFile(resolve(folder, 'everb.asm'), 'utf8')
    const modifiers = [...asm.matchAll(/move\s+#>\$([0-9a-f]+),m[0-7]/g)].map(match => parseInt(match[1], 16))
    expect(modifiers.length).toBeGreaterThan(0)
    for (const value of modifiers) expect([0xffffff, 0x3dfd]).toContain(value)
    expect(modifiers).toContain(0x3dfd)
    expect(await readFile(resolve(folder, 'manifest.py'), 'utf8')).toContain('buffer_words=15870')
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
    for (const media of document.media.filter(item => item.otUi)) {
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
