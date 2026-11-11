import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BetaUi, useBetaUi } from '../community/beta-ui'
import { MODULES } from '../catalog/modules'
import { CompatibilityPanel } from '../components/CompatibilityPanel'
import { MachineLibrary } from '../devices/MachinePages'
import { DEVICES_BY_ID } from '../devices/registry'
import { prepareModuleSet, ModuleSetError, USB_MODULE_IDS } from '../engine/elekloader/module-set'
import { cardFallbackReason, libraryCompatibility, moduleCardOnly } from './library-compatibility'
import { isModulePaused } from './availability'
import cardOnlyApprovals from '../../sdk/approvals/usb-card-only.json' with { type: 'json' }

const noop = () => {}
const everb = MODULES.find(module => module.id === 'everb')!
function Library({ selected, all = false }: { selected: string[]; all?: boolean }) {
  const { conflicts, blocks } = libraryCompatibility(useBetaUi(), selected, false, ['everb'])
  return createElement(MachineLibrary, {
    device: all ? undefined : DEVICES_BY_ID.octatrack, query: '', octatrackModules: [everb], octatrackSelected: selected,
    onToggleOctatrack: noop, digiSelected: { digitakt: all ? ['digislicer', 'digisophie'] : [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [] }, onToggleDigi: noop,
    family: 'all', onFamilyChange: noop, sort: 'collection', onSortChange: noop, statistics: [],
    octatrackConflicts: conflicts, octatrackBlocks: blocks, comparison: [], onCompare: noop, onOpenComparison: noop,
    viewedModuleVersions: {}, moduleBaseline: [],
  })
}
const library = (beta: boolean, selected: string[], all = false) => renderToStaticMarkup(createElement(BetaUi, { value: beta }, createElement(Library, { selected, all })))

describe('USB library feedback and card admission stay separate', () => {
  it('offers E-Verb without a baked Analog BD swap warning only in the beta USB library', () => {
    const classic = library(false, ['analog-bassdrum'])
    expect(classic).toContain('Conflicts with Analog BD')
    expect(classic).toContain('is-conflict')
    const beta = library(true, ['analog-bassdrum'])
    expect(beta).not.toContain('Conflicts with Analog BD')
    expect(beta).not.toContain('is-conflict')
    expect(beta).toContain('Add E-Verb to module set')
  })
  it('removes the baked Octatrack warning while retaining the separate Digi combination warning', () => {
    const classic = library(false, ['analog-bassdrum', 'everb'], true)
    expect(classic).toContain('Octatrack: your selection needs a change')
    const beta = library(true, ['analog-bassdrum', 'everb'], true)
    expect(beta).not.toContain('Octatrack: your selection needs a change')
    expect(beta).toContain('Digitakt: your selection needs a change')
  })
  it('keeps the exact card placement refusal even under the beta interface', () => {
    const html = renderToStaticMarkup(createElement(BetaUi, { value: true }, createElement(CompatibilityPanel, {
      ids: ['analog-bassdrum', 'everb'], keepStockFx2: false, onFix: noop,
    })))
    expect(html).toContain('Choose effects that fit with Analog BD')
    expect(html).toContain('E-Verb')
    expect(html).toContain('compatibility-conflict')
  })
  it('does not make a missing Analog BD USB package loadable by removing the card warning', async () => {
    const load = vi.fn()
    await expect(prepareModuleSet({ name: 'USB', moduleIds: ['analog-bassdrum', 'everb'] }, { moduleIds: [], removedStockFx: [] }, load)).rejects.toThrow(ModuleSetError)
    expect(load).not.toHaveBeenCalled()
  })
})

describe('a module only the Modwerk base can load (usb-only.ts)', () => {
  const published = { packages: [{ id: 'everb', requires: 8 }] }
  it('cannot be added without USB sync, and is offered as usual in the beta USB library', () => {
    expect(libraryCompatibility(true, [], false, ['everb'], published).blocks).toEqual({})
    const { blocks } = libraryCompatibility(false, ['analog-bassdrum'], false, ['everb'], published)
    expect(blocks.everb).toMatchObject({ kind: 'usb-only', reason: 'USB only' })
    expect(blocks.everb.detail).not.toMatch(/beta/)
    expect(libraryCompatibility(false, ['everb'], false, ['everb'], published).blocks.everb).toBeUndefined() // in the set already: removable
    const html = renderToStaticMarkup(createElement(BetaUi, { value: false }, createElement(MachineLibrary, {
      device: DEVICES_BY_ID.octatrack, query: '', octatrackModules: [everb], octatrackSelected: [], onToggleOctatrack: noop,
      digiSelected: { digitakt: [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [] }, onToggleDigi: noop, family: 'all', onFamilyChange: noop, sort: 'collection',
      onSortChange: noop, statistics: [], octatrackConflicts: [], octatrackBlocks: blocks, comparison: [], onCompare: noop, onOpenComparison: noop,
      viewedModuleVersions: {}, moduleBaseline: [],
    })))
    expect(html).toMatch(/<button[^>]*class="add-button is-blocked"[^>]*disabled/)
    expect(html).toContain('USB only')
    expect(html).not.toContain('in the beta')
  })
})

describe('a module with no USB package (card only)', () => {
  const marked = (beta: boolean, id: string) => renderToStaticMarkup(createElement(BetaUi, { value: beta }, createElement(MachineLibrary, {
    device: DEVICES_BY_ID.octatrack, query: '', octatrackModules: [MODULES.find(module => module.id === id)!], octatrackSelected: [], onToggleOctatrack: noop,
    digiSelected: { digitakt: [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [] }, onToggleDigi: noop, family: 'all', onFamilyChange: noop, sort: 'collection',
    onSortChange: noop, statistics: [], octatrackConflicts: [], octatrackBlocks: {}, comparison: [], onCompare: noop, onOpenComparison: noop,
    viewedModuleVersions: {}, moduleBaseline: [],
  })))
  it('is the sync dialog’s card-only list, and the owner’s card-only approvals', () => {
    const cardOnly = MODULES.filter(module => moduleCardOnly(module.id)).map(module => module.id).sort()
    expect(cardOnly).toEqual(MODULES.filter(module => !isModulePaused(module.id) && !USB_MODULE_IDS.includes(module.id)).map(module => module.id).sort())
    expect(cardOnly).toEqual(cardOnlyApprovals.modules.map(record => record.module).sort())
    expect(cardFallbackReason()).toContain('for modules that have no USB version yet (')
  })
  it('says Card only on its library card on the Octatrack base path, and nothing extra without it', () => {
    const id = MODULES.find(module => moduleCardOnly(module.id))!.id
    const html = marked(true, id)
    expect(html).toContain('add-block-chip is-card-only')
    expect(html).toContain('Card only')
    expect(html).toContain('has no USB version yet')
    expect(html).not.toContain('is-blocked') // it can still be added, for the card build
    expect(marked(false, id)).not.toContain('Card only')
    expect(marked(true, 'miniverb')).not.toContain('Card only')
  })
})
