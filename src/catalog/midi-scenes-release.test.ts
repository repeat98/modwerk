import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MODULE_DOCUMENTS_BY_ID } from './documents'
import { requireFolderQualification } from '../../scripts/module-qualification.mjs'
import current from '../../sdk/octabam/modules/midi-scenes/recipe.json'
import historical from '../../sdk/drafts/midi-scenes/recipe.json'
import provenance from '../../sdk/imports/midi-scenes-release-4f9a894.json'
import requested from '../engine/assets/requested-packages.json'
const folder = resolve('sdk/octabam/modules/midi-scenes')
const document = MODULE_DOCUMENTS_BY_ID['midi-scenes']
// 0.2.5 adds the Scene A/B mute patch on top of the author's recipe, which stays byte for byte as imported.
const CHANGED_IN_0_2_5 = ['README.md', 'TESTING.md', 'media/capture.json', 'octamod.module.json', 'patch.py']
describe('exact owner-approved MIDISC2.0 release', () => {
  it('keeps the unchanged guarded author image and binds every other imported file', () => {
    expect({ ...current, moduleVersion: historical.moduleVersion }).toEqual(historical)
    expect(current.moduleVersion).toBe('0.2.4-experimental')
    for (const [path, hash] of Object.entries(provenance.files)) {
      expect(createHash('sha256').update(readFileSync(resolve(folder,path))).digest('hex') === hash).toBe(!CHANGED_IN_0_2_5.includes(path))
    }
    expect(document.version).toBe('0.2.5-experimental')
    expect(document.tests.hardwareStatus).toBe('reported')
    expect(document.tests.qualification).toBeUndefined()
    expect(document.tests.releaseWaiver).toBeUndefined()
    expect(requested.objects.some(object=>object.moduleId==='midi-scenes')).toBe(false)
    expect(requested.groups.some(group=>group.moduleId==='midi-scenes')).toBe(false)
  })
  it('cannot extend approval to future versions or changed source, while documentation edits keep it', async () => {
    const copy=mkdtempSync(resolve(tmpdir(),'octamod-midisc-approval.'))
    try {
      cpSync(folder,copy,{recursive:true})
      expect(await requireFolderQualification(copy,document,new Map())).toBe('owner-approved-update')
      await expect(requireFolderQualification(copy,{...document,version:'0.2.6-experimental'},new Map())).rejects.toThrow('does not cover this module version')
      writeFileSync(resolve(copy,'README.md'),readFileSync(resolve(copy,'README.md'),'utf8')+'Changed documentation\n')
      expect(await requireFolderQualification(copy,document,new Map())).toBe('owner-approved-update')
      writeFileSync(resolve(copy,'patch.py'),'raise AssertionError("do not execute source")\n')
      await expect(requireFolderQualification(copy,document,new Map())).rejects.toThrow('does not cover this exact native source')
    } finally { rmSync(copy,{recursive:true,force:true}) }
  })
})
