// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../catalog/modules'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { classifyCpuCaution, MODULE_CAUTIONS } from '../catalog/module-cautions'
import { CautionBadge, ModuleCard } from './ModuleCard'

// A badge follows from a module's own CPU evidence (classifyCpuCaution), so these tests hold the rule and read which modules
// carry one from the catalogue. They once listed the badged modules and their readings by hand: every release that measured a
// module then had to edit this file, and two such pull requests open at once failed each other's checks after the first merged.
const cautioned = Object.keys(MODULE_CAUTIONS)
const plain = MODULES.find(module => !MODULE_CAUTIONS[module.id])!.id

describe('Octatrack CPU cautions', () => {
  it('badges catalogue modules only, each at the tier of the frame share its reading names', () => {
    expect(cautioned.length).toBeGreaterThan(0)
    for (const [id, caution] of Object.entries(MODULE_CAUTIONS)) {
      expect(MODULES.some(module => module.id === id), id).toBe(true)
      // The reading leads with the share that set the tier; a stacked-limit caution may carry no share of its own.
      const share = Number(caution.detail.match(/^(?:The release budgets )?(\d+(?:\.\d+)?)/)?.[1] ?? NaN)
      if (!Number.isNaN(share)) expect(caution.badge, id).toBe(share >= 30 ? 'Heavy CPU' : 'High CPU')
    }
  })

  it.each(cautioned)('shows the CPU badge and accessible workload for %s', id => {
    const caution = MODULE_CAUTIONS[id]
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(CautionBadge, { id })), 'text/html')
    const badge = doc.querySelector('.module-caution-badge')
    expect(badge?.getAttribute('data-tier')).toBe(caution.tier)
    expect(badge?.textContent).toContain(caution.badge)
    expect(caution.detail).not.toBe('')
    expect(badge?.getAttribute('title')).toBe(caution.detail)
    expect(badge?.querySelector('.sr-only')?.textContent).toContain(caution.detail)
  })

  it('shows nothing for a module without a caution', () => {
    expect(renderToStaticMarkup(createElement(CautionBadge, { id: plain }))).toBe('')
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

  it.each([...cautioned, plain])('uses the appropriate artwork indicator on the %s card', id => {
    const label = MODULE_CAUTIONS[id]?.badge ?? null
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
