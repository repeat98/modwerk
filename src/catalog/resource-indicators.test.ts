import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { MODULE_DOCUMENTS } from './documents'
import { parseModuleDocument, parseModuleResourceImpact } from './module-contract'
import { moduleResourceIndicators } from './resource-indicators'
import { readDspLoad, readTrackedMemory } from './octatrack-resource-measurements'
import { parseRetainedResourceImpacts, requireModuleResourceImpact } from './resource-impact'
import { resourceImpactFixture } from './test-fixtures/resource-impact'
import example from '../../public/module-repository.example.json'
import directDspEvidence from '../../docs/verification/2026-11-21-octatrack-direct-dsp-code.json'
import baseline from '../../sdk/approvals/module-qualification-baseline.json'
import retained from '../../sdk/module-resource-estimates.json'
import waivers from '../../sdk/approvals/module-release-waivers.json'
import synthApproval from '../../sdk/approvals/synth-build-approval.json'
import muteApproval from '../../sdk/approvals/mute-modes-build-approval.json'
import recorderApproval from '../../sdk/approvals/recorder-loop-fix-build-approval.json'
import airChorusApproval from '../../sdk/approvals/airwindows-chorus-build-approval.json'
import poly8Approval from '../../sdk/approvals/poly8-build-approval.json'
import everbApproval from '../../sdk/approvals/everb-build-approval.json'
import playmodesApproval from '../../sdk/approvals/playmodes-build-approval.json'
import amigaApproval from '../../sdk/approvals/amiga-build-approval.json'
import tempSaveApproval from '../../sdk/approvals/temp-save-build-approval.json'
import kitsApproval from '../../sdk/approvals/kits-build-approval.json'
import grainApproval from '../../sdk/approvals/grain-build-approval.json'
import sdkCatalog from '../../sdk/catalog.json'
import packageManifest from '../engine/assets/octatrack-module-packages.json'

const draft = () => parseModuleDocument(example)
const rated = () => parseModuleDocument({ ...example, resources: { ...example.resources, impact: resourceImpactFixture() } })

describe('module resource gauges', () => {
  it('populates CPU, DSP and memory for every current version without inventing measurements', () => {
    expect(MODULE_DOCUMENTS).toHaveLength(sdkCatalog.modules.length)
    // Only versions under an owner exception may go without a qualification record; none is invented for them.
    const exempt = new Set([...baseline.modules, ...waivers.modules, synthApproval, muteApproval, recorderApproval, airChorusApproval, poly8Approval, everbApproval, playmodesApproval, amigaApproval, tempSaveApproval, kitsApproval, grainApproval].map(module => module.id))
    for (const document of MODULE_DOCUMENTS) {
      const indicators = moduleResourceIndicators(document)
      expect(indicators.map(indicator => indicator.id)).toEqual(['cpu', 'dsp', 'memory'])
      for (const indicator of indicators) {
        const price = document.resources.cpuPrice
        if (indicator.id === 'cpu' && price) {
          expect(indicator).toMatchObject({
            value: price.value + '%', score: price.value, maximum: 100, fill: price.value,
            source: 'sdk/octatrack/modules/' + document.id + '/' + price.source,
          })
          expect(indicator.description).toContain(price.conditions)
          if (price.measure === 'machine-render') expect(indicator.valueText).toContain('per playing track')
        } else if (indicator.score === null) {
          expect(indicator.valueText).toBeTruthy()
          expect(indicator.fill).toBe(0)
        } else if (indicator.maximum === 100) {
          expect(indicator.valueText).toBeTruthy()
          expect(indicator.fill).toBe(indicator.score)
          expect(indicator.score).toBeGreaterThanOrEqual(0)
          expect(indicator.score).toBeLessThanOrEqual(100)
        } else {
          expect(['Minimal', 'Low', 'Moderate', 'High']).toContain(indicator.value)
          expect(indicator.fill).toBeGreaterThan(0)
          expect(indicator.status).toBe('Estimated')
        }
        expect(indicator.description.length).toBeGreaterThan(20)
      }
      if(document.id==='sidechain-compressor') expect(document.tests.hardwareStatus).toBe('reported')
      if(document.id==='tapehead') expect(document.tests.hardwareStatus).toBe('reported')
      if(!document.tests.qualification) expect(exempt, document.id + ' needs tests.qualification').toContain(document.id)
    }
  })

  it('draws ordinal load tiers without using a CPU or DSP capacity denominator', () => {
    const document = rated()
    document.resources.impact!.cpu.basis = 'measured-comparison'
    const [cpu, dsp, memory] = moduleResourceIndicators(document)
    expect(cpu).toMatchObject({ value: 'Minimal', score: 1, fill: 25, status: 'Estimated' })
    expect(dsp).toMatchObject({ value: 'High', score: 4, fill: 100, status: 'Estimated' })
    expect(memory).toMatchObject({ value: 'Moderate', score: 3, fill: 75 })
    expect(document.resources.processing.method).toBe('unmeasured')
    expect(document.resources.processing.value).toBeNull()
  })

  it('shows only the reported eleven-stem hardware peak for the card build', () => {
    const stems = MODULE_DOCUMENTS.find(document => document.id === 'stem-rec')!
    expect(moduleResourceIndicators(stems)[0]).toMatchObject({
      value: '14.6%', status: 'Reported peak · 11 stems', score: 14.6, maximum: 100, fill: 14.6,
      source: 'sdk/octatrack/modules/stem-rec/TESTING.md',
    })
    expect(moduleResourceIndicators({ ...stems, version: '0.2.0' })[0].status).toBe('Estimated')
  })

  it('uses hardware DSP readings and keeps software benchmarks in the evidence', () => {
    const lofi = MODULE_DOCUMENTS.find(document => document.id === 'lofi2')!
    const outputMatrix = MODULE_DOCUMENTS.find(document => document.id === 'output-matrix')!
    const bbd = MODULE_DOCUMENTS.find(document => document.id === 'bbd')!
    const chorus = MODULE_DOCUMENTS.find(document => document.id === 'airwindows-chorus')!
    const lofiPrice = packageManifest.packages.find(entry => entry.id === lofi.id)!.cycles
    const bbdPrice = packageManifest.packages.find(entry => entry.id === bbd.id)!.cycles
    const hookPrice = outputMatrix.tests.qualification!.cycles.find(cycle => cycle.processor === 'dsp')!
    const memory = lofi.tests.qualification!.memory
    const [, lofiDsp, lofiMemory] = moduleResourceIndicators(lofi)
    expect(lofiDsp).toMatchObject({
      value: '+10.3 pp', status: 'Measured · T1–4', score: 10.3, maximum: 100, fill: 10.3,
      benchmark: { value: lofiPrice + ' cycles per sample per instance', basis: 'cycles/sample · Hardware-based' },
    })
    expect(lofiMemory).toMatchObject({ value: '11.926 kB', status: 'Accounted total', score: null })
    expect(lofiMemory.description).toContain((memory.sharedBytes / 1000) + ' kB shared')
    expect(lofiMemory.description).toContain((memory.perInstanceBytes / 1000) + ' kB per instance')
    expect(moduleResourceIndicators(outputMatrix)[1]).toMatchObject({
      value: '+6.8 pp', status: 'Measured · T5–8', score: 6.8, maximum: 100, fill: 6.8,
      benchmark: { value: hookPrice.worstCase + ' cycles per sample for one instance', source: 'sdk/octatrack/modules/output-matrix/' + hookPrice.report },
    })
    expect(moduleResourceIndicators(outputMatrix)[0].benchmark?.value).toBe('13.1% of a frame added with ALL routes in MATRIX mode')
    expect(moduleResourceIndicators(bbd)[1]).toMatchObject({
      value: '+10.8 pp', status: 'Measured · T1–4',
      benchmark: { value: bbdPrice + ' instructions per sample per instance', basis: 'instr./sample · Emulator' },
    })
    expect(moduleResourceIndicators(chorus)[1]).toMatchObject({ value: '+10.8 pp', status: 'Measured · T1–4', source: 'sdk/octatrack/modules/airwindows-chorus/TESTING.md' })
    const future = { ...rated(), id: lofi.id, version: '99.0.0' }
    expect(moduleResourceIndicators(future)[1]).toMatchObject({ value: 'High', status: 'Estimated' })
  })

  it('shows the measured active CPU load when an Octatrack build has a verified workload', () => {
    const analog = MODULE_DOCUMENTS.find(module => module.id === 'analog-bassdrum')!
    for (const [id, value] of [
      ['amiga', '7.4%'], ['analog-bassdrum', '10.1%'], ['poly8', '41.9%'], ['syntiz', '8.5%'],
      ['vector', '0.6%'],
    ]) {
      const document = MODULE_DOCUMENTS.find(module => module.id === id)!
      const [cpu] = moduleResourceIndicators(document)
      expect(cpu, id).toMatchObject({ value, status: 'Measured · in use' })
      expect(cpu.description).toContain('(estimated) while the release price is pending')
    }
    expect(moduleResourceIndicators(analog)[1]).toMatchObject({ value: '+5.6 pp', status: 'Measured · T1–4' })
    expect(moduleResourceIndicators({ ...analog, version: '99.0.0' })[0].status).toBe('Estimated')
  })

  it('binds zero direct DSP cycles to the audited packages and preserves active DSP paths', () => {
    for (const record of directDspEvidence.modules) {
      const document = MODULE_DOCUMENTS.find(module => module.id === record.module)
      if (document?.version !== record.version) continue
      expect(moduleResourceIndicators(document)[1]).toMatchObject({
        value: '0 cycles', status: 'Module code · ColdFire', score: null, source: record.source,
      })
      expect(moduleResourceIndicators({ ...document, version: '99.0.0' })[1].status).toBe('Estimated')
      if (!record.packageSha256) continue
      const entry = record.module === 'usb-audio-out-tracks-main-cue' ? packageManifest.usbAudio.configurable
        : packageManifest.packages.find(pkg => pkg.id === record.module)!
      const bytes = readFileSync('public/' + entry.path)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.packageSha256)
      expect(bytes.readUInt32BE(32)).toBe(0)
    }
    for (const id of ['analog-bassdrum', 'output-matrix', 'sidechain-compressor']) {
      const document = MODULE_DOCUMENTS.find(module => module.id === id)!
      expect(moduleResourceIndicators(document)[1].value).not.toBe('0 cycles')
    }
  })

  it('uses the selected track’s core and the tracked pools from the same clean trial', () => {
    const document = rated()
    const before = { skipped: 0, dsp1to4: 30, dsp5to8: 31, allocation: {
      modulePoolBytes: 0, dspProgramWordsT1to4: 50, dspProgramWordsT5to8: 80,
    } }
    const inUse = { skipped: 0, dsp1to4: 29.9, dsp5to8: 42, allocation: {
      modulePoolBytes: 512, dspProgramWordsT1to4: 50, dspProgramWordsT5to8: 192,
    } }
    const result = { id: document.id, version: document.version, rolledBack: true, before, inUse, inUseOn: 'T5 FX2' }
    const record = { module: document.id, version: document.version, base: 'test base', scene: 'saved scratch Part', result }
    expect(readDspLoad(document, record)).toMatchObject({ before: 31, after: 42, core: 'T5–8', slot: 'T5 FX2' })
    expect(readTrackedMemory(document, record)).toMatchObject({ poolBytes: 512, dspWordsT1to4: 0, dspWordsT5to8: 112 })
    expect(readDspLoad(document, { ...record, version: '99.0.0' })).toBeUndefined()
    expect(readDspLoad(document, { ...record, result: { ...result, repetitions: [{
      before, inUse: { ...inUse, dsp5to8: 39 },
    }] } })).toBeUndefined()
    expect(readTrackedMemory(document, { ...record, result: { ...result, inUse: { ...inUse, skipped: 1 } } })).toBeUndefined()
    expect(readTrackedMemory(document, { ...record, result: { ...result, before: {
      ...before, allocation: { ...before.allocation, modulePoolBytes: 128 },
    } } })).toBeUndefined()
  })

  it.each([
    ['cc-map', '1.568 kB'],
    ['playmodes', '17.168 kB'],
    ['recorder-loop-fix', '2.208 kB'],
    ['previewvol', '0.944 kB'],
  ])('shows the hardware-verified module pool for %s at its measured version', (id, value) => {
    const document = MODULE_DOCUMENTS.find(module => module.id === id)!
    expect(moduleResourceIndicators(document)[2]).toMatchObject({
      value, status: 'Measured · module pool', score: null,
      source: 'docs/verification/2026-11-21-octatrack-module-pool-allocation.json',
    })
    expect(moduleResourceIndicators({ ...document, version: '99.0.0' })[2].status).toBe('Estimated')
  })

  it('includes Kits’ observed sample lease with the measured module pool', () => {
    const kits = MODULE_DOCUMENTS.find(module => module.id === 'kits')!
    const memory = moduleResourceIndicators(kits)[2]
    expect(memory).toMatchObject({ value: '2,085.232 kB', status: 'Measured · two pools', score: null })
    expect(memory.description).toContain('51.568 kB in the module pool and 2,033.664 kB in leased sample RAM')
  })

  it('shows the incremental Sidechain DSP load against stock compression', () => {
    const sidechain = MODULE_DOCUMENTS.find(module => module.id === 'sidechain-compressor')!
    expect(moduleResourceIndicators(sidechain)[1]).toMatchObject({ value: '+1.8 pp', status: 'Measured · T5–8' })
    expect(moduleResourceIndicators(sidechain)[1].description).toContain('compared with stock COMPRESSOR')
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
