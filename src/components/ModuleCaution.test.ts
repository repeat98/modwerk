// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../catalog/modules'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { classifyCpuCaution, MODULE_CAUTIONS } from '../catalog/module-cautions'
import { CautionBadge, ModuleCard } from './ModuleCard'

describe('Octatrack CPU cautions', () => {
  it('reserves Heavy CPU for POLY8 and Grain and marks four catalog modules High CPU', () => {
    expect(Object.fromEntries(Object.entries(MODULE_CAUTIONS).map(([id, caution]) => [id, caution.badge]))).toEqual({
      poly8: 'Heavy CPU',
      grain: 'Heavy CPU',
      syntiz: 'High CPU',
      tapeecho: 'High CPU',
      'output-matrix': 'High CPU',
      'analog-bassdrum': 'High CPU',
    })
    for (const id of Object.keys(MODULE_CAUTIONS)) expect(MODULES.some(module => module.id === id)).toBe(true)
  })

  it.each([
    ['poly8', 'heavy', 'Heavy CPU', '41.9 percentage points of audio-frame load added with one POLY8 track with repeated trigs'],
    ['tapeecho', 'high', 'High CPU', '11.5 percentage points of audio-frame load for the first copy and 4.1 for each further one'],
  ])('shows the CPU badge and accessible workload for %s', (id, tier, label, workload) => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(CautionBadge, { id })), 'text/html')
    const badge = doc.querySelector('.module-caution-badge')
    expect(badge?.getAttribute('data-tier')).toBe(tier)
    expect(badge?.textContent).toContain(label)
    expect(badge?.getAttribute('title')).toContain(workload)
    expect(badge?.querySelector('.sr-only')?.textContent).toContain(workload)
  })

  it('shows nothing for a module without a caution', () => {
    expect(renderToStaticMarkup(createElement(CautionBadge, { id: 'miniverb' }))).toBe('')
  })

  it.each([
    [9.9, undefined], [10, 'High CPU'], [29.9, 'High CPU'], [30, 'Heavy CPU'],
  ])('derives the badge when a release price is %s percent of a frame', (value, badge) => {
    const document = MODULE_DOCUMENTS_BY_ID.miniverb
    const resources = { ...document.resources, cpuPrice: { ...document.resources.cpuPrice!, value } }
    expect(classifyCpuCaution({ ...document, resources })?.badge).toBe(badge)
  })

  it.each(['poly8', 'tapeecho', 'syntiz'])('drops stale workload evidence for a new %s release', id => {
    const document = MODULE_DOCUMENTS_BY_ID[id]
    expect(classifyCpuCaution({ ...document, version: '99.0.0-experimental' })).toBeUndefined()
  })

  it.each([
    ['poly8', 'Heavy CPU'],
    ['output-matrix', 'High CPU'],
    ['synth', null],
  ])('uses the appropriate artwork indicator on the %s card', (id, label) => {
    const module = MODULES.find(item => item.id === id)!
    const card = createElement(ModuleCard, { module, selected: false, compared: false, canCompare: true, baseline: null, onToggle() {}, onCompare() {} })
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(card), 'text/html')
    const badge = doc.querySelector('.preview-label .module-caution-badge')
    const title = doc.querySelector('.module-card-heading > a')!
    if (label) {
      expect(badge?.textContent).toContain(label)
      expect(badge?.id).toBe(title.getAttribute('aria-describedby'))
      expect(doc.querySelector('.preview-led')).toBeNull()
    } else {
      expect(badge).toBeNull()
      expect(title.hasAttribute('aria-describedby')).toBe(false)
      expect(doc.querySelector('.preview-label .preview-led')).toBeTruthy()
    }
  })
})
