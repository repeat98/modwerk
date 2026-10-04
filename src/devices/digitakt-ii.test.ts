import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import MACHINES from './machines.generated.json'
import { DEVICES_BY_ID } from './registry'
import { DIGI_MODS, isDigiDevice } from './digi-mods'
import { EmptyMachine } from './MachinePages'
import { parseMachineProfile } from './machine-contract'
import { parseElemodBuild, parseModwerkModule, requireModwerkPublication } from '../catalog/module-contract-v3'
import CATALOG from '../catalog/machine-modules.json'
import IMPORT from '../../sdk/imports/elekloader-pr38-digitakt-ii.json'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const machines = MACHINES.map(parseMachineProfile)

describe('Digitakt II pending integration', () => {
  it('validates the draft contracts and rejects publication without qualification', () => {
    const module = parseModwerkModule(json('sdk/drafts/perform-direct/modwerk.module.json'), machines)
    expect(parseElemodBuild(json('sdk/drafts/perform-direct/build.json'), module).subscribe).toEqual([{ event: 'ev_key', fn: 'pd_key', order: 10 }])
    expect(() => requireModwerkPublication(module)).toThrow('before publication')
  })
  it('preserves source identities and keeps the drafts out of public discovery/builds', () => {
    for (const file of IMPORT.files) expect(createHash('sha256').update(readFileSync(file.path)).digest('hex'), file.path).toBe(file.sha256)
    const loader = json('sdk/drafts/digitakt-ii-core/loader/UPSTREAM.json')
    expect(json('vendor/elekloader/UPSTREAM.json').commit).toBe(loader.baseline)
    for (const [path, hash] of Object.entries(loader.files)) {
      const source = loader.overlays.includes(path) ? 'sdk/drafts/digitakt-ii-core/loader/' : 'vendor/elekloader/'
      expect(createHash('sha256').update(readFileSync(source + path)).digest('hex'), path).toBe(hash)
    }
    expect(DIGI_MODS.some(mod => String(mod.device) === 'digitakt-ii')).toBe(false)
    expect(CATALOG.modules.some(mod => mod.id === 'perform-direct')).toBe(false)
    expect(isDigiDevice('digitakt-ii')).toBe(false)
    expect(machines.find(machine => machine.id === 'digitakt-ii')!.sdk!.modules).toBe('sdk/digitakt-ii/modules')
  })
  it('retains actual monochrome captures bound to the source, build, version and complete tutorial', async () => {
    const folder = 'sdk/drafts/perform-direct/'
    const module = parseModwerkModule(json(folder + 'modwerk.module.json'), machines)
    const record = json(folder + 'media/capture.json')
    const qualification = json(folder + 'qualification.pending.json')
    expect(record.moduleVersion).toBe(module.version)
    expect(qualification.localBuildSha256).toBe(record.imageSha256)
    expect(qualification.moduleSourceSha256).toBe(createHash('sha256').update(readFileSync(folder + 'src/perform.c')).digest('hex'))
    expect(record.build.memory.combined.ddrTotalBytes).toBe(576)
    expect(record.build.memory.module.ddr.bytes).toBe(module.resources.memoryBytes)
    expect(qualification.worstCaseCycles).toBeNull()
    expect(qualification.hardwareStress).toBeNull()
    for (const [path, hash] of Object.entries(record.sourceFiles)) expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(hash)
    for (const [path, hash] of Object.entries(record.tools)) expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(hash)
    expect(module.media.filter(media => media.otUi?.shows.includes('location'))).not.toHaveLength(0)
    expect(module.media.filter(media => media.otUi?.shows.includes('controls'))).not.toHaveLength(0)
    for (const shot of record.screenshots) {
      const png = readFileSync(folder + shot.path)
      expect(createHash('sha256').update(png).digest('hex')).toBe(shot.sha256)
      const media = module.media.find(media => media.path === shot.path)!
      expect(media.capture).toMatchObject({ release: '1.17', moduleVersion: module.version, imageSha256: record.imageSha256 })
      expect(media.otUi).toMatchObject({ page: shot.page, shows: shot.shows, firmware: '1.17', moduleVersion: module.version, imageSha256: record.imageSha256 })
      const { data, info } = await sharp(png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
      expect([info.width, info.height, info.channels]).toEqual([768, 384, 3])
      const colors = new Set<number>()
      for (let at = 0; at < data.length; at += 3) {
        if (data[at] !== data[at + 1] || data[at] !== data[at + 2]) throw new Error(shot.path + ' contains colored pixels')
        colors.add(data[at])
      }
      expect([...colors].sort((a, b) => a - b)).toEqual([0, 255])
    }
    const readme = readFileSync(folder + 'README.md', 'utf8')
    for (const heading of ['Overview', 'Controls', 'Usage', 'Compatibility and limitations', 'Tests and measurements', 'Authorship and licences', 'Screens and audio']) expect(readme).toContain('## ' + heading)
    expect(readme).toContain('### Tutorial: ' + qualification.documentation.tutorial)
    expect(readme.match(/^\d\. /gm)).toHaveLength(3)
    for (const path of qualification.documentation.screenshots) expect(readme).toContain('](' + path + ')')
    expect(readFileSync(folder + 'TESTING.md', 'utf8')).toContain(record.imageSha256)
  })
  it('rejects conflicting UI capture provenance', () => {
    const value = json('sdk/drafts/perform-direct/modwerk.module.json')
    value.media[1].otUi.imageSha256 = '0'.repeat(64)
    expect(() => parseModwerkModule(value, machines)).toThrow('provenance must match')
  })
  it('explains the pending module and permits local import/removal without offering a build', () => {
    const html = renderToStaticMarkup(createElement(EmptyMachine, { device: DEVICES_BY_ID['digitakt-ii'] }))
    expect(html).toContain('Perform Direct is in review')
    expect(html).toContain('Choose original Digitakt II firmware')
    expect(html).toContain('Remove from device')
    expect(html).toContain('Never uploaded')
    expect(html).not.toContain('Nobody has published a working mod')
    expect(html).not.toContain('Download firmware')
    expect(html).not.toContain('Build firmware')
  })
})
