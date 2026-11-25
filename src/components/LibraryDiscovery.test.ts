// @vitest-environment jsdom
import { publishedUsbAudioPackage } from '../config/published-usb-audio.fixture'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVAILABLE_MODULES, availableModules } from '../catalog/availability'
import { asBeta } from '../catalog/beta-fixture'
import { countsTowardLimit, SET_MODULE_LIMIT } from '../catalog/set-limit'
import { newConfiguration } from '../config/workspace'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { MachineLibrary } from '../devices/MachinePages'
import { DEVICES_BY_ID } from '../devices/registry'
import { LibrarySelection } from './LibrarySelection'
import { ModuleComparison } from './ModuleComparison'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); document.querySelectorAll('[data-test-slot]').forEach(slot => slot.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (name: string) => [...document.querySelectorAll('button')].find(button => button.textContent === name)!
const noop = () => {}
const library = {
  query: '', octatrackModules: AVAILABLE_MODULES, octatrackSelected: [], onToggleOctatrack: noop,
  digiSelected: { digitakt: [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [], 'model-cycles': [] }, onToggleDigi: noop,
  family: 'all', onFamilyChange: noop, sort: 'updated', onSortChange: noop, statistics: null,
  comparison: [], onCompare: noop, onOpenComparison: noop,
  viewedModuleVersions: {}, moduleBaseline: null,
}

describe('module library discovery', () => {
  it('offers Scenes as a Performance type and groups macros across instruments', async () => {
    const performance = AVAILABLE_MODULES.filter(module => module.category === 'performance')
    const render = (family: string) => act(() => root.render(createElement(MachineLibrary, {
      ...library, category: 'performance', family, octatrackModules: performance.filter(module => module.type === family),
    })))
    await render('Scenes')
    const types = Array.from(container.querySelectorAll('.catalog-sort-group select:first-of-type option'), option => option.textContent)
    expect(types).toEqual(expect.arrayContaining(['Scenes', 'Crossfader', 'Macros', 'Mutes & solos']))
    expect(types).not.toContain('Kits & parts')
    expect(container.querySelectorAll('.module-card')).toHaveLength(2)
    expect(container.querySelector('.module-grid')?.textContent).toContain('MIDI Scenes')
    await render('Macros')
    expect(container.querySelector('#machine-digitakt')).not.toBeNull()
    expect(container.querySelector('#machine-analog-rytm-mkii')).not.toBeNull()
    expect(container.querySelector('#machine-octatrack')).toBeNull()
  })

  it('lets desktop users change type directly and dismiss the separate category menu with Escape', async () => {
    const onFamilyChange = vi.fn()
    const categoryNav = createElement('nav', { 'aria-label': 'Module library' }, createElement('a', { href: '#effects' }, 'Effects'))
    await act(() => root.render(createElement(MachineLibrary, { ...library, categoryNav, onFamilyChange })))
    const toggle = container.querySelector<HTMLButtonElement>('.catalog-command')!
    const panel = container.querySelector<HTMLDivElement>('.catalog-filter-panel')!
    expect(panel.hidden).toBe(true)
    await click(toggle)
    expect(panel.hidden).toBe(false)
    expect(document.activeElement).toBe(panel.querySelector('a'))
    expect(panel.querySelector('select')).toBeNull()
    await act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(toggle)
    const type = container.querySelector<HTMLSelectElement>('.catalog-sort-group select')!
    await act(() => { type.focus(); type.value = 'Delay'; type.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(onFamilyChange).toHaveBeenCalledWith('Delay')
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(type)
  })

  it.each([
    { buildHref: '#digitakt/configuration', buildLabel: 'Build firmware for Digitakt', buildText: undefined },
    { buildHref: '#zoom-ms-70cdr/pedal/set', buildLabel: 'Open your MS-70CDR and sync your set to it', buildText: 'Your MS-70CDR' },
  ])('uses the active machine’s destination and action label for $buildHref in All machines', async ({ buildHref, buildLabel, buildText }) => {
    await act(() => root.render(createElement(MachineLibrary, { ...library, buildHref, buildLabel, buildText })))
    const build = container.querySelector('.discovery-actions a')!
    expect(build.getAttribute('href')).toBe(buildHref)
    expect(build.getAttribute('aria-label')).toBe(buildLabel)
    expect(build.textContent).toBe(buildText ?? 'Build firmware')
  })
  it('finds Digi modules with combined instrument and type words', async () => {
    await act(() => root.render(createElement(MachineLibrary, { ...library, octatrackModules: [], query: 'digitakt midi' })))
    expect(container.querySelector('.module-card')).not.toBeNull()
    expect(container.querySelector('#machine-digitone')).toBeNull()
  })
  it('removes one active filter at a time and keeps keyboard focus on the results heading', async () => {
    const onClearQuery = vi.fn(), onFamilyChange = vi.fn(), onClearSearch = vi.fn()
    await act(() => root.render(createElement(MachineLibrary, { ...library, query: 'echo', family: 'Delay', onClearQuery, onFamilyChange, onClearSearch })))
    await click(container.querySelector('[aria-label="Remove search “echo”"]')!)
    expect(onClearQuery).toHaveBeenCalledOnce()
    expect(onFamilyChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('h1'))
    await click(container.querySelector('[aria-label="Remove type filter Delay"]')!)
    expect(onFamilyChange).toHaveBeenCalledWith('all')
    await click(container.querySelector('.filter-clear-all')!)
    expect(onClearSearch).toHaveBeenCalledOnce()
  })
  it('counts beta modules from the same catalogue as the cards', () => asBeta(async () => {
    const beta = availableModules(true).find(module => !AVAILABLE_MODULES.some(item => item.id === module.id))!
    expect(beta).toBeDefined()
    const slot = document.createElement('div'); slot.dataset.testSlot = ''; document.body.append(slot)
    await act(() => root.render(createElement(MachineLibrary, { ...library, device: DEVICES_BY_ID.octatrack, query: beta.name, octatrackModules: [beta], octatrackCatalogue: availableModules(true), phone: true, resultsSlot: slot })))
    await click(slot.querySelector('[aria-label="Type: all types"]')!)
    expect(buttonNamed('All types1')).toBeDefined()
  }))
  it('only includes the eligible beta module in comparisons when beta access is present', () => asBeta(() => {
    const props = { ids: ['airwindows-chorus', 'everb'], selected: [], digiSelected: library.digiSelected, onToggle: noop, onToggleDigi: noop, onClose: noop }
    const count = (betaAccess: boolean) => renderToStaticMarkup(createElement(ModuleComparison, { ...props, betaAccess })).match(/<th scope="col">/g)?.length
    expect(count(false)).toBe(2)
    expect(count(true)).toBe(3)
  }))
})

describe('live library selection details', () => {
  it('updates the Octatrack count and reports saved stock FX choices', async () => {
    const set = newConfiguration('Live set', ['everb', USB_AUDIO_MODULE])
    const render = (moduleIds: string[], removedStockFx?: string[]) => act(() => root.render(
      createElement(LibrarySelection, { sets: [{ ...set, moduleIds, removedStockFx }], betaAccess: false, collapsible: true }),
    ))
    await render(set.moduleIds)
    const status = container.querySelector('[role="status"]')!
    const panel = container.querySelector('.library-selection')!
    const initialCount = publishedUsbAudioPackage ? 2 : 1
    expect(panel.textContent).toContain(`${initialCount} of ${SET_MODULE_LIMIT} modules`)
    expect(panel.textContent).toContain('All stock FX kept')
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('#configuration')
    await render([...set.moduleIds, 'tapeecho'], ['SPRING REV'])
    expect(status.textContent).toContain(`${initialCount + 1} of ${SET_MODULE_LIMIT} modules`)
    expect(panel.textContent).toContain('Spring Reverb is marked off in the stock FX menus')
    expect(panel.textContent).toContain('USB sync requires all stock FX')
    await render([])
    expect(container.querySelector('.library-selection')).toBeNull()
    expect(status.textContent).toBe('No selections to check.')
  })

  it('distinguishes a full Octatrack set from a saved set already over the limit', async () => {
    const ids = AVAILABLE_MODULES.map(module => module.id).filter(id => countsTowardLimit(id)).slice(0, SET_MODULE_LIMIT + 1)
    const render = (moduleIds: string[]) => act(() => root.render(
      createElement(LibrarySelection, { sets: [newConfiguration('Live set', moduleIds)], betaAccess: false, collapsible: true }),
    ))
    await render(ids.slice(0, SET_MODULE_LIMIT))
    expect(container.textContent).toContain('Your set is full')
    await render(ids)
    expect(container.textContent).toContain('Remove 1 to sync')
  })

  it('updates Digi memory and incompatibility details independently of an Octatrack set', async () => {
    const octatrack = newConfiguration('Live set', ['everb'])
    const digitakt = newConfiguration('Drums', ['digimono', 'digistring'], false, undefined, 'digitakt')
    const render = (moduleIds: string[]) => act(() => root.render(
      createElement(LibrarySelection, { sets: [octatrack, { ...digitakt, moduleIds }], betaAccess: false, collapsible: true }),
    ))
    await render(digitakt.moduleIds)
    const details = container.querySelector('details')!
    const summary = details.querySelector('summary')!
    expect(details.open).toBe(false)
    expect(summary.textContent).toContain('1 issue')
    expect(details.textContent).toContain('Digi Mono and STRING cannot be used together')
    expect(details.textContent).toContain('Estimated memory')
    expect(details.querySelector('a[href="#digitakt/configuration"]')).not.toBeNull()
    details.open = true
    await render(['digislicer', 'digineighbor', 'digisophie', 'digihealth'])
    expect(details.open).toBe(true)
    expect(details.textContent).toContain('Over the shared memory limit')
    expect(details.textContent).not.toContain('Digi Mono and STRING')
    await render(['digislicer', 'digineighbor'])
    expect(summary.textContent).toBe('Selection details')
    expect(details.textContent).toContain('All stock FX kept')
  })
})
