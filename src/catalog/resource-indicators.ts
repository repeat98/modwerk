import type { ModuleDocument } from './module-contract'
import packageManifest from '../engine/assets/octatrack-module-packages.json'
import { measuredDspLoad, measuredTrackedMemory } from './octatrack-resource-measurements'
import { requireModuleResourceImpact } from './resource-impact'

const packagesById = new Map(packageManifest.packages.map(entry => [entry.id, entry]))
const packageDspEvidence = {
  hardware: { unit: 'cycles/sample', basis: 'Hardware-based', description: 'The release package’s DSP price comes from hardware timing.' },
  executed: { unit: 'instr./sample', basis: 'Emulator', description: 'The release package’s DSP price uses executed emulator instructions.' },
  modeled: { unit: 'cycles/sample', basis: 'Modeled', description: 'The release package’s DSP price uses a static cycle model.' },
} as const
const qualificationDspBasis = { hardware: 'Measured', emulator: 'Emulator', static: 'Modeled' } as const
const count = (value: number) => value.toLocaleString('en-US')

function dspIndicator(document: ModuleDocument) {
  const entry = packagesById.get(document.id)
  if (entry?.version === document.version && 'cycles' in entry && typeof entry.cycles === 'number' && 'cyclesKind' in entry) {
    const evidence = packageDspEvidence[entry.cyclesKind as keyof typeof packageDspEvidence]
    if (evidence) {
      const value = count(entry.cycles)
      return {
        value, score: null, fill: 0, status: evidence.unit + ' · ' + evidence.basis, hardware: entry.cyclesKind === 'hardware',
        valueText: value + ' ' + evidence.unit.replace('instr.', 'instructions').replace('/', ' per ') + ' per instance',
        description: evidence.description + ' The figure is per active instance before the base applies any admission margin.',
        source: 'src/engine/assets/octatrack-module-packages.json',
        sourceInModwerk: true,
      }
    }
  }
  const cycle = document.tests.qualification?.cycles.find(record => record.processor === 'dsp')
  if (!cycle) return
  const value = count(cycle.worstCase)
  const basis = qualificationDspBasis[cycle.method]
  return {
    value, score: null, fill: 0, status: cycle.unit + ' · ' + basis, hardware: cycle.method === 'hardware',
    valueText: value + ' ' + cycle.unit.replace('/', ' per ') + ' for one instance',
    description: 'Worst-case DSP count for one instance in the qualification record. ' + cycle.conditions.maxLoad,
    source: 'sdk/octatrack/modules/' + document.id + '/' + cycle.report,
    sourceInModwerk: true,
  }
}

export function moduleResourceIndicators(document: ModuleDocument) {
  const impact = requireModuleResourceImpact(document)
  const price = document.resources.cpuPrice
  const dsp = dspIndicator(document)
  const dspLoad = measuredDspLoad(document)
  const memory = document.tests.qualification?.memory
  const tracked = memory ? undefined : measuredTrackedMemory(document)
  // The card build reports an observed interrupt peak for eleven stems, with the full configuration still estimated.
  const stemPeak = document.id === 'stem-rec' && document.version === '0.1.0-experimental'
    ? document.tests.qualification?.cycles.find(record => record.processor === 'coldfire' && record.method === 'hardware' && record.unit === 'cycles/block')
    : undefined
  const levels = { minimal: { score: 1, label: 'Minimal' }, low: { score: 2, label: 'Low' }, moderate: { score: 3, label: 'Moderate' }, high: { score: 4, label: 'High' } }
  return (['cpu', 'dsp', 'memory'] as const).map(id => {
    if (id === 'cpu' && price) {
      const perTrack = price.measure === 'machine-render'
      const value = price.value + '%'
      return {
        id, label: 'CPU', ariaLabel: 'CPU price', value, score: price.value, maximum: 100, fill: price.value,
        status: perTrack ? 'Frame budget · per track' : 'Measured · of frame',
        valueText: perTrack
          ? value + ' of an audio frame per playing track, budget based on hardware measurements'
          : value + ' of an audio frame, measured on hardware',
        description: (perTrack ? 'The base budgets this share for one playing track.' : 'Added frame-interrupt time in the test.')
          + ' Measured on ' + price.date + '. ' + price.conditions,
        source: 'sdk/octatrack/modules/' + document.id + '/' + price.source,
        sourceInModwerk: true,
      }
    }
    if (id === 'cpu' && stemPeak?.budget) {
      const value = (100 * stemPeak.worstCase / stemPeak.budget).toFixed(1) + '%'
      return {
        id, label: 'CPU', ariaLabel: 'Reported peak CPU load', value, score: null, fill: 0,
        status: 'Reported peak · 11 stems',
        valueText: value + ' peak share of an audio block while recording eleven stems',
        description: 'Yves Rosius reported a peak of ' + count(stemPeak.worstCase) + ' of ' + count(stemPeak.budget)
          + ' cycles per audio block in two eleven-stem, 24-bit takes on an Octatrack MKII. The fourteen-stem measurement is pending.',
        source: 'sdk/octatrack/modules/stem-rec/' + stemPeak.report, sourceInModwerk: true,
      }
    }
    if (id === 'dsp' && dspLoad) {
      const delta = Math.round((dspLoad.after - dspLoad.before) * 10) / 10
      const value = (delta > 0 ? '+' : '') + delta
      return {
        id, label: 'DSP core', value: value + ' pp', score: null, fill: 0, status: 'Measured · ' + dspLoad.core,
        valueText: value + ' percentage points of DSP core load',
        description: 'Core ' + dspLoad.core + ' went from ' + dspLoad.before + '% to ' + dspLoad.after + '% with one instance on '
          + dspLoad.slot + '. ' + dspLoad.scene + ' Base ' + dspLoad.base + '.',
        source: dspLoad.source, sourceInModwerk: true,
        benchmark: dsp ? { value: dsp.valueText, basis: dsp.status, source: dsp.source } : undefined,
      }
    }
    if (id === 'dsp' && dsp?.hardware) return { id, label: 'DSP core', ...dsp, value: dsp.value + ' cycles' }
    if (id === 'memory' && memory) {
      const value = count(memory.totalBytes) + ' B'
      return {
        id, label: 'Memory', value, score: null, fill: 0, status: 'Accounted total',
        valueText: count(memory.totalBytes) + ' bytes at the supported instance limit',
        description: count(memory.sharedBytes) + ' B shared plus ' + count(memory.perInstanceBytes)
          + ' B per instance. The total covers up to ' + memory.maxInstances + ' instances. ' + memory.conditions,
        source: 'sdk/octatrack/modules/' + document.id + '/' + memory.report,
        sourceInModwerk: true,
      }
    }
    if (id === 'memory' && tracked) {
      const words = tracked.dspWordsT1to4 + tracked.dspWordsT5to8
      const bytes = tracked.poolBytes + 3 * words
      return {
        id, label: 'Memory', value: count(bytes) + ' B', score: null, fill: 0, status: 'Tracked allocation',
        valueText: count(bytes) + ' bytes of tracked allocation',
        description: count(tracked.poolBytes) + ' B in the module pool and ' + count(words) + ' 24-bit DSP program words across both cores. '
          + 'This count covers the measured pools ' + (tracked.slot ? 'with the effect on ' + tracked.slot : 'with the module installed and unused')
          + '. ' + tracked.scene + ' Base ' + tracked.base + '.',
        source: tracked.source, sourceInModwerk: true,
      }
    }
    const estimate = impact[id]
    const level = levels[estimate.level]
    return {
      id, label: id === 'cpu' ? 'CPU' : id === 'dsp' ? 'DSP core' : 'Memory',
      value: level.label, score: level.score, fill: level.score / 4 * 100,
      status: 'Estimated',
      description: estimate.rationale, source: estimate.source,
      benchmark: id === 'dsp' && dsp ? { value: dsp.valueText, basis: dsp.status, source: dsp.source } : undefined,
    }
  })
}
