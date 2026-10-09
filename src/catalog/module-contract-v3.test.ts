import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MACHINES from '../devices/machines.generated.json'
import type { MachineProfile } from '../devices/machine-contract'
import { LIBRARY_CATEGORIES } from './modules'
import { MODULE_V3_CATEGORIES, compareCoreVersions, parseElemodBuild, parseModwerkModule, requireModwerkPublication, type ModwerkModule } from './module-contract-v3'

const machines = MACHINES as MachineProfile[]
const template = (machine = 'digitakt') => JSON.parse(readFileSync(resolve('sdk/templates/elemod/modwerk.module.json'), 'utf8')
  .replaceAll('__ID__', 'proof').replaceAll('__NAME__', 'Proof').replaceAll('__KEY__', 'PROOF').replaceAll('__MACHINE__', machine)
  .replaceAll('__AUTHOR__', 'example-author').replaceAll('__RELEASE__', machine === 'digitone' ? '1.44' : '1.54').replaceAll('__CORE__', '2.1'))
const sha = 'a'.repeat(64)
const published = (): Record<string, unknown> => ({
  ...template(),
  access: { location: 'SRC machine list', steps: ['Press SRC and choose PROOF.'], screenshots: ['media/location.png'] },
  resources: { memoryBytes: 2048, fastBytes: null, load: { display: 'About 3% of the render', method: 'hardware', conditions: 'Eight tracks playing with parameters modulated.' } },
  evidence: { tier: 'author-hardware', moduleVersion: '0.1.0-experimental', sourceSha256: sha, reports: ['TESTING.md'], hardware: { model: 'Digitakt mk1', release: '1.54', testedOn: '2026-10-04', tester: 'example-author', durationMinutes: 60, summary: 'Ran a full project for an hour without dropouts.', limitations: [] }, verifiedBy: null },
  media: [...template().media, { path: 'media/location.png', kind: 'screenshot', caption: 'Where PROOF appears', alt: 'SRC page listing PROOF', credit: 'example-author', license: 'GPL-3.0-or-later', source: 'Captured on a Digitakt mk1', capture: { release: '1.54', moduleVersion: '0.1.0-experimental', imageSha256: sha, setup: 'Empty project, track 1.' } }],
})
const parse = (value: unknown) => parseModwerkModule(value, machines)

describe('module contract v3', () => {
  it('keeps contributor attribution separate from maintained module access', () => {
    const value = template(), contributors = [{ github: 'bryantysinger', name: 'Bryan Tysinger' }, { github: 'tester-two' }]
    value.author.contributors = contributors
    const document = parse(value)
    expect(document.author.contributors).toEqual(contributors)
    expect(document.maintainers).toEqual(['example-author'])
    value.author.contributors = [{ github: 'EXAMPLE-AUTHOR' }]
    expect(() => parse(value)).toThrow('credit each person once')
  })
  it('keeps a declared documentation tutorial and its captures tied to the displayed module version', () => {
    const value = published() as ReturnType<typeof template>
    const steps = ['Select PROOF.', 'Move a control.', 'Play and stop the pattern.']
    value.presentation.usage = steps
    value.tests.documentation = { tutorial: { title: 'Quick tutorial', steps }, screenshots: ['media/location.png'], captureRecord: 'media/capture.json' }
    value.media[1].capture.type = 'emulator'
    expect(parse(value).tests.documentation?.tutorial.steps).toEqual(steps)
    for (const mutate of [
      (doc: typeof value) => { doc.tests.documentation.tutorial.steps = steps.slice(0, 2) },
      (doc: typeof value) => { doc.presentation.usage = [...steps].reverse() },
      (doc: typeof value) => { doc.tests.documentation.screenshots = ['media/missing.png'] },
      (doc: typeof value) => { doc.media[1].capture.moduleVersion = '0.0.1' },
      (doc: typeof value) => { delete doc.media[1].capture.type },
    ]) {
      const invalid = structuredClone(value); mutate(invalid)
      expect(() => parse(invalid)).toThrow()
    }
  })

  it('accepts the SDK template as an unpublished draft', () => {
    const document = parse(template())
    expect(document).toMatchObject({ machine: 'digitakt', exclusive: false, maintainers: ['example-author'], evidence: { tier: 'none' } })
    expect(() => requireModwerkPublication(document)).toThrow('measure the module’s memory')
    expect(parseElemodBuild(JSON.parse(readFileSync(resolve('sdk/templates/elemod/build.json'), 'utf8').replace('__RELEASE__', '1.54')), document).subscribe).toEqual([{ event: 'ev_draw', fn: 'mod_draw', order: 50 }])
  })

  it('shares the library categories, including standalone firmware', () => {
    expect([...MODULE_V3_CATEGORIES]).toEqual([...LIBRARY_CATEGORIES])
  })

  it('publishes measured modules with the author’s hardware report', () => {
    const document = parse(published())
    expect(() => requireModwerkPublication(document)).not.toThrow()
    expect(() => requireModwerkPublication({ ...document, evidence: { ...document.evidence, tier: 'emulator', hardware: null } } as ModwerkModule)).toThrow('author-hardware')
  })

  it('binds each tier to what it claims', () => {
    const value = published() as { evidence: Record<string, unknown> }
    expect(() => parse({ ...value, evidence: { ...value.evidence, moduleVersion: '0.0.9' } })).toThrow('this module version')
    expect(() => parse({ ...value, evidence: { ...value.evidence, hardware: null } })).toThrow('hardware report')
    expect(() => parse({ ...value, evidence: { ...value.evidence, tier: 'owner-verified' } })).toThrow('name the owner')
    expect(() => parse({ ...value, evidence: { ...value.evidence, verifiedBy: 'repeat98' } })).toThrow('only owner-verified')
  })

  it('checks the module against its machine profile', () => {
    expect(() => parse({ ...template(), machine: 'syntakt' })).toThrow('no SDK yet')
    expect(() => parse({ ...template(), machine: 'octatrack' })).toThrow('octabam')
    expect(() => parse({ ...template(), compatibility: { ...template().compatibility, releases: ['1.30'] } })).toThrow('not a Digitakt OS release')
    expect(() => parse({ ...template(), resources: { ...template().resources, memoryBytes: 200000 } })).toThrow('exceed the Digitakt budget')
    expect(() => parse({ ...template(), platform: { ...template().platform, core: '9.0' } })).toThrow('newer than the machine’s core')
  })

  it('keeps maintainers, paths and standalone firmware honest', () => {
    expect(() => parse({ ...template(), maintainers: ['someone-else'] })).toThrow('include the author')
    expect(() => parse({ ...template(), license: { ...template().license, file: '../LICENSE' } })).toThrow('inside the module folder')
    expect(() => parse({ ...template(), tests: { ...template().tests, report: 'out/firmware.syx' } })).toThrow('not accepted')
    expect(() => parse({ ...template(), category: 'standalone' })).toThrow('exclusive')
    expect(() => parse({ ...template(), category: 'standalone', exclusive: true })).toThrow('does not link with the core')
    expect(parse({ ...template(), category: 'standalone', exclusive: true, platform: { ...template().platform, events: [] } }).exclusive).toBe(true)
    expect(() => parse({ ...template(), surprise: true })).toThrow('unknown field')
  })

  it('compares core releases numerically', () => {
    expect(compareCoreVersions('2.10', '2.9')).toBeGreaterThan(0)
    expect(compareCoreVersions('2.1', '2.1')).toBe(0)
  })

  it('validates generated string symbols and explicitly supported local derivation ports', () => {
    const document = parse(template())
    const build = JSON.parse(readFileSync(resolve('sdk/templates/elemod/build.json'), 'utf8').replace('__RELEASE__', '1.54'))
    expect(parseElemodBuild({ ...build, strings: { str_name: 'Proof 1.0' } }, document).strings).toEqual({ str_name: 'Proof 1.0' })
    expect(() => parseElemodBuild({ ...build, strings: { 'bad symbol': 'Proof' } }, document)).toThrow('C symbol')
    const derive = { kind: 'fast_audio', note: 'Synthetic', release: '1.54', releases: ['1.53'], block: ['0x40001000', '0x40001008'], sram: ['0x80003360', '0x80008000'], callSites: [] }
    expect(() => parseElemodBuild({ ...build, derive }, document)).toThrow('supported releases including the base')
  })
})
