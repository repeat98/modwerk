import { describe, expect, it } from 'vitest'
import { MODULE_DOCUMENTS } from './documents'
import { parseModuleDocument, parseModuleResourceImpact } from './module-contract'
import { moduleResourceIndicators } from './resource-indicators'
import { parseRetainedResourceImpacts, requireModuleResourceImpact } from './resource-impact'
import { resourceImpactFixture } from './test-fixtures/resource-impact'
import example from '../../public/module-repository.example.json'
import baseline from '../../sdk/module-qualification-baseline.json'
import retained from '../../sdk/module-resource-estimates.json'
import waivers from '../../sdk/module-release-waivers.json'
import midiScenesApproval from '../../sdk/midi-scenes-build-approval.json'
import synthApproval from '../../sdk/synth-build-approval.json'
import muteApproval from '../../sdk/mute-modes-build-approval.json'
import recorderApproval from '../../sdk/recorder-loop-fix-build-approval.json'
import airChorusApproval from '../../sdk/airwindows-chorus-build-approval.json'
import poly8Approval from '../../sdk/poly8-build-approval.json'
import sdkCatalog from '../../sdk/catalog.json'

const draft = () => parseModuleDocument(example)
const rated = () => parseModuleDocument({ ...example, resources: { ...example.resources, impact: resourceImpactFixture() } })

describe('required relative module resource gauges', () => {
  it('populates CPU, DSP and memory for every current version without inventing measurements', () => {
    expect(MODULE_DOCUMENTS).toHaveLength(sdkCatalog.modules.length)
    // Only versions under an owner exception may go without a qualification record; none is invented for them.
    const exempt = new Set([...baseline.modules, ...waivers.modules, midiScenesApproval, synthApproval, muteApproval, recorderApproval, airChorusApproval, poly8Approval].map(module => module.id))
    for (const document of MODULE_DOCUMENTS) {
      const indicators = moduleResourceIndicators(document)
      expect(indicators.map(indicator => indicator.id)).toEqual(['cpu', 'dsp', 'memory'])
      for (const indicator of indicators) {
        expect(['Minimal', 'Low', 'Moderate', 'High']).toContain(indicator.value)
        expect(indicator.fill).toBeGreaterThan(0)
        expect(indicator.description.length).toBeGreaterThan(20)
        expect(indicator.value).not.toContain('%')
      }
      if(document.id==='sidechain-compressor') expect(document.tests.hardwareStatus).toBe('reported')
      if(document.id==='tapehead') expect(document.tests.hardwareStatus).toBe('reported')
      if(!document.tests.qualification) expect(exempt, document.id + ' needs tests.qualification').toContain(document.id)
    }
  })

  it('draws ordinal load tiers without using a CPU or DSP capacity denominator', () => {
    const document = rated()
    const [cpu, dsp, memory] = moduleResourceIndicators(document)
    expect(cpu).toMatchObject({ value: 'Minimal', score: 1, fill: 25, status: 'Estimated' })
    expect(dsp).toMatchObject({ value: 'High', score: 4, fill: 100, status: 'Compared' })
    expect(memory).toMatchObject({ value: 'Moderate', score: 3, fill: 75 })
    expect(document.resources.processing.method).toBe('unmeasured')
    expect(document.resources.processing.value).toBeNull()
  })

  it('keeps drafts parseable but blocks releases and gauge rendering without ratings', () => {
    expect(draft().resources.impact).toBeUndefined()
    expect(() => requireModuleResourceImpact(draft())).toThrow('release requires populated CPU, DSP core and memory gauges')
    expect(() => moduleResourceIndicators(draft())).toThrow('release requires populated')
    for (const key of ['cpu', 'dsp', 'memory', 'conditions']) {
      const impact = { ...resourceImpactFixture() } as Record<string, unknown>
      delete impact[key]
      expect(() => parseModuleResourceImpact(impact)).toThrow('required field')
    }
  })

  it('rejects placeholders, unknown fields and estimates without rationale or local provenance', () => {
    for (const change of [{ level: null }, { level: 'unknown' }, { level: 50 }, { basis: 'hardware-percentage' }, { rationale: '' }, { source: '../README.md' }, { source: 'firmware.bin' }, { extra: true }]) {
      const impact = resourceImpactFixture()
      expect(() => parseModuleResourceImpact({ ...impact, cpu: { ...impact.cpu, ...change } })).toThrow()
    }
    expect(() => parseModuleResourceImpact({ ...resourceImpactFixture(), conditions: '' })).toThrow()
    expect(() => parseModuleResourceImpact({ ...resourceImpactFixture(), budget: 100 })).toThrow('unknown field')
  })

  it('limits companion estimates to exact versions and hashes in the existing frozen baseline', () => {
    const records = parseRetainedResourceImpacts(retained, baseline.modules)
    expect(records.size).toBe(11)
    const record = retained.modules[0]
    for (const change of [{ id: 'new-module' }, { version: '999.0.0' }, { folderSha256: 'f'.repeat(64) }, { extra: true }]) {
      expect(() => parseRetainedResourceImpacts({ ...retained, modules: [{ ...record, ...change }] }, baseline.modules)).toThrow('unchanged existing versions')
    }
    expect(() => parseRetainedResourceImpacts({ ...retained, modules: [record, record] }, baseline.modules)).toThrow('unique')
    expect(() => parseRetainedResourceImpacts({ ...retained, override: true }, baseline.modules)).toThrow('schema')
  })

  it('rejects absent or outdated companion ratings and gives current manifest ratings precedence', () => {
    const record = { id: example.id, version: example.version, folderSha256: 'a'.repeat(64), impact: resourceImpactFixture() }
    const records = parseRetainedResourceImpacts({ schemaVersion: 1, modules: [record] }, [record])
    expect(requireModuleResourceImpact(draft(), records)).toEqual(record.impact)
    const updated = draft()
    updated.version = '99.0.0'
    expect(() => requireModuleResourceImpact(updated, records)).toThrow('release requires populated')
    expect(() => requireModuleResourceImpact(draft(), new Map())).toThrow('release requires populated')
    const document = rated()
    document.resources.impact!.cpu.level = 'low'
    expect(requireModuleResourceImpact(document, records).cpu.level).toBe('low')
  })
})
