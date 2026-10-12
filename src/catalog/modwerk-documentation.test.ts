import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModwerkModule } from './module-contract-v3'
import { requireModwerkDocumentation, REQUIRED_README_SECTIONS } from '../../scripts/module-documentation.mjs'
import { qualificationPng } from './test-fixtures/qualification'

const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'digi-doc-test-')); folders.push(folder)
  const imageSha256 = 'a'.repeat(64), steps = ['Select the machine.', 'Move a control.', 'Play and stop.']
  const document = { id: 'proof', machine: 'digitakt', version: '0.1.0', access: { screenshots: ['media/ui.png'] }, tests: { documentation: { tutorial: { title: 'Quick tutorial', steps }, screenshots: ['media/ui.png'], captureRecord: 'media/capture.json' } }, media: [{ path: 'media/ui.png', kind: 'screenshot', capture: { release: '1.53', imageSha256 } }] } as ModwerkModule
  const readme = REQUIRED_README_SECTIONS.map(title => '## ' + title + '\nContent.').join('\n') + '\n### Quick tutorial\n' + steps.join('\n') + '\n![Actual LCD](media/ui.png)\n'
  const record = { schemaVersion: 1, machine: 'digitakt', moduleId: 'proof', moduleVersion: '0.1.0', firmware: '1.53', imageSha256, captures: [{ path: 'media/ui.png', plan: 'tap SRC\nsnap ui', sha256: createHash('sha256').update(qualificationPng).digest('hex') }] }
  await mkdir(join(folder, 'media')); await writeFile(join(folder, 'README.md'), readme); await writeFile(join(folder, 'media/ui.png'), qualificationPng)
  const save = () => writeFile(join(folder, 'media/capture.json'), JSON.stringify(record))
  await save()
  return { folder, document, record, save }
}
describe('Digi documentation files', () => {
  it('validates the complete guide, actual PNG pixels and matching provenance', async () => {
    const { folder, document } = await fixture()
    await expect(requireModwerkDocumentation(folder, document)).resolves.toBeUndefined()
  })
  it('accepts consumer setup captures for modules with no independent UI', async () => {
    const { folder, document } = await fixture()
    document.access = { noUiReason: 'A shared framework used by a dependent machine.' }
    await expect(requireModwerkDocumentation(folder, document)).resolves.toBeUndefined()
  })
  it('rejects a stale version, different image, missing input plan and altered screenshot', async () => {
    const { folder, document, record, save } = await fixture()
    record.moduleVersion = '0.0.1'; await save()
    await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('capture record')
    record.moduleVersion = '0.1.0'; record.imageSha256 = 'b'.repeat(64); await save()
    await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('matching image/release')
    record.imageSha256 = 'a'.repeat(64); record.captures[0].plan = ''; await save()
    await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('panel-input plan')
    record.captures[0].plan = 'tap SRC'; record.captures[0].sha256 = 'c'.repeat(64); await save()
    await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('screenshot hash')
  })
})

it('keeps each OS capture tied to its own image and rejects duplicate or stale bundled records', async () => {
  const { folder, document, record } = await fixture()
  const second = structuredClone(record)
  second.firmware = '1.54'; second.imageSha256 = 'b'.repeat(64); second.captures[0].path = 'media/ui154.png'
  await writeFile(join(folder, 'media/ui154.png'), qualificationPng)
  document.media.push({ ...document.media[0], path: 'media/ui154.png', capture: { ...document.media[0].capture!, release: '1.54', imageSha256: second.imageSha256 } })
  document.tests.documentation!.screenshots.push('media/ui154.png')
  await writeFile(join(folder, 'README.md'), await readFile(join(folder, 'README.md'), 'utf8') + '\n![OS 1.54](media/ui154.png)\n')
  const bundle = { schemaVersion: 2, machine: 'digitakt', moduleId: 'proof', moduleVersion: '0.1.0', records: [record, second] }
  const save = () => writeFile(join(folder, 'media/capture.json'), JSON.stringify(bundle))
  await save(); await expect(requireModwerkDocumentation(folder, document)).resolves.toBeUndefined()
  bundle.records.push(record); await save()
  await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('one capture record')
  bundle.records.pop(); second.imageSha256 = 'c'.repeat(64); await save()
  await expect(requireModwerkDocumentation(folder, document)).rejects.toThrow('matching image/release')
})
