import type { ModuleDocument } from './module-contract'
import { requireModuleResourceImpact } from './resource-impact'

export function moduleResourceIndicators(document: ModuleDocument) {
  const impact = requireModuleResourceImpact(document)
  const price = document.resources.cpuPrice
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
        source: price.source,
      }
    }
    const estimate = impact[id]
    const level = levels[estimate.level]
    return {
      id, label: id === 'cpu' ? 'CPU' : id === 'dsp' ? 'DSP core' : 'Memory',
      value: level.label, score: level.score, fill: level.score / 4 * 100,
      status: id === 'cpu' || estimate.basis === 'source-estimate' ? 'Estimated' : 'Compared',
      description: estimate.rationale, source: estimate.source,
    }
  })
}
