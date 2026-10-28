import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import draft from '../../sdk/octabam/modules/vector/octamod.module.json'
import capture from '../../sdk/octabam/modules/vector/media/capture.json'
import coreTests from '../../sdk/octabam/modules/vector/media/core-tests.json'
import behavior from '../../sdk/octabam/modules/vector/media/behavior-0.2.4.json'
import persistence from '../../docs/vector-reboot-2026-10-09.json'
import pools from '../../sdk/octabam/modules/vector/media/pool-behavior.json'
import baseline from '../../sdk/module-qualification-baseline.json'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication } from './module-contract'
import { moduleNativeSourceSha256, parseQualificationBaseline, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import { requireCompleteReadme, requireMonochromePng } from '../../scripts/module-documentation.mjs'
import { MODULES, resolveSelection } from './modules'

const folder = resolve('sdk/octabam/modules/vector')
// 0.2.5 changes only the USB package: its card source (the native source SHA-256 below) and card build are 0.2.4's, so
// 0.2.4's emulator and behaviour records stand for its card build; the UI captures are labelled 0.2.5 for publication.
const CARD_EVIDENCE = '0.2.4-experimental'
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

describe('VECTOR release', () => {
  it('publishes a reported functional hardware result for 0.2.5', async () => {
    const document = parseModuleDocument(draft)
    expect(document.tests.hardwareStatus).toBe('reported')
    expect(document.tests.qualification!.hardware).toMatchObject({ kind: 'functional', status: 'reported', model: 'MKII', testedOn: '2026-10-27' })
    expect(() => requireModuleUiForPublication(document)).not.toThrow()
    expect(() => requireModuleQualificationForPublication(document)).not.toThrow()
    await expect(requireFolderQualification(folder, document, parseQualificationBaseline(baseline))).resolves.toBe('qualified')
    expect(MODULES.some(module => module.id === document.id)).toBe(true)
    expect(resolveSelection([document.id]).map(module => module.id)).toEqual(['vector'])
    expect(await readdir(resolve('sdk/octabam/modules'))).toContain(document.id)
    expect(baseline.modules.some(module => module.id === document.id)).toBe(false)
  })

  it('does not extend the 9 October owner exception to another version or source', async () => {
    const document = parseModuleDocument(draft)
    const waived = structuredClone(document)
    waived.tests.hardwareStatus = 'untested'
    waived.tests.qualification!.hardware = { kind: 'owner-waived', status: 'waived', approvedBy: 'repeat98', approvedOn: '2026-10-09', reason: 'test', report: 'TESTING.md' }
    expect(() => requireModuleQualificationForPublication(waived)).toThrow('only exact approved releases')
    const changed = structuredClone(document)
    changed.tests.qualification!.sourceSha256 = 'a'.repeat(64)
    await expect(requireFolderQualification(folder, changed, parseQualificationBaseline(baseline))).rejects.toThrow('source SHA-256 differs')
  })

  it('binds reviewed monochrome captures and complete tutorial to the authored source', async () => {
    const document = parseModuleDocument(draft)
    expect(capture.moduleVersion).toBe(CARD_EVIDENCE)
    expect(capture.sourceSha256).toBe(await moduleNativeSourceSha256(folder, document))
    expect(document.tests.qualification!.documentation.screenshots).toEqual(document.access!.screenshots)
    requireCompleteReadme({ id: document.id, tests: { qualification: { documentation: { ...document.tests.qualification!.documentation, screenshotStyle: 'black-and-white' as const } } } }, await readFile(resolve(folder, 'README.md'), 'utf8'))
    for (const media of document.media) {
      const bytes = await readFile(resolve(folder, media.path))
      requireMonochromePng(bytes)
      expect(sha(bytes)).toBe(capture.screenshots[media.path.slice('media/'.length) as keyof typeof capture.screenshots])
      expect(media.otUi?.moduleVersion).toBe(document.version)
      expect(media.otUi?.imageSha256).toBe(capture.imageSha256)
    }
    for (const [path, hash] of Object.entries(capture.nativeBuildInputs)) {
      expect(sha(await readFile(resolve(folder, path)))).toBe(hash)
    }
    expect(sha(await readFile(resolve(folder, capture.panelWalk)))).toBe(capture.panelWalkSha256)
  })

  it('records sequence commits and advancing playback separately from UI captures', () => {
    expect(draft.controls.map(control => control.name)).toEqual(['TYPE', 'DENS', 'ROOT', 'SCAL', 'GATE', 'ACNT', 'SEED', 'SPAN', 'OFST', 'ROT', 'RPT', 'DIR'])
    expect(behavior.moduleVersion).toBe(CARD_EVIDENCE)
    expect(behavior.imageSha256).toBe(capture.imageSha256)
    expect(behavior.sourceSha256).toBe(capture.sourceSha256)
    expect(behavior.result).toBe('passed')
    expect(behavior.checks.stepsAdvanceAfterPlay).toBe(true)
    expect(behavior.checks.twelveSrcControlsEdited).toBe(true)
    expect(behavior.checks.otherSevenTracksUnchanged).toBe(true)
    expect(behavior.checks.poolBrowsingPreservesSettings).toBe(true)
    expect(persistence.moduleVersion).toBe(CARD_EVIDENCE)
    expect(persistence.sourceSha256).toBe(capture.sourceSha256)
    expect(persistence.imageSha256).toBe(capture.imageSha256)
    expect(Object.values(persistence.checks).every(Boolean)).toBe(true)
    // Do not promote historical sample-confirmation/audio results to this source.
    expect(pools.moduleVersion).toBe('0.2.3-experimental')
    expect(pools.sourceSha256).not.toBe(capture.sourceSha256)
  })

  it('binds the recorded firmware-free tests without running native code in application checks', async () => {
    expect(coreTests.moduleVersion).toBe(CARD_EVIDENCE)
    for (const [path, hash] of Object.entries(coreTests.sources)) {
      expect(sha(await readFile(resolve(folder, path)))).toBe(hash)
    }
    const files = await readdir(folder, { recursive: true })
    expect(files.filter(file => /(?:runtime\.s|\.(?:bin|syx|elf|o|img|dmp|lcd))$/i.test(file))).toEqual([])
  })
})
