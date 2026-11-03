// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVAILABLE_MODULES, availableModules } from '../catalog/availability'
import { MachineLibrary } from '../devices/MachinePages'
import { DEVICES_BY_ID } from '../devices/registry'
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
  digiSelected: { digitakt: [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [] }, onToggleDigi: noop,
  family: 'all', onFamilyChange: noop, sort: 'updated', onSortChange: noop, statistics: null,
  octatrackConflicts: [], comparison: [], onCompare: noop, onOpenComparison: noop,
  viewedModuleVersions: {}, moduleBaseline: null,
}

describe('module library discovery', () => {
  it('uses the active machine’s configuration for the All machines build action', async () => {
    await act(() => root.render(createElement(MachineLibrary, { ...library, buildHref: '#digitakt/configuration', buildLabel: 'Build firmware for Digitakt' })))
    const build = container.querySelector('.discovery-actions a')!
    expect(build.getAttribute('href')).toBe('#digitakt/configuration')
    expect(build.getAttribute('aria-label')).toBe('Build firmware for Digitakt')
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
  it('counts beta modules from the same catalogue as the cards', async () => {
    const beta = availableModules(true).find(module => !AVAILABLE_MODULES.some(item => item.id === module.id))!
    expect(beta).toBeDefined()
    const slot = document.createElement('div'); slot.dataset.testSlot = ''; document.body.append(slot)
    await act(() => root.render(createElement(MachineLibrary, { ...library, device: DEVICES_BY_ID.octatrack, query: beta.name, octatrackModules: [beta], octatrackCatalogue: availableModules(true), phone: true, resultsSlot: slot })))
    await click(slot.querySelector('[aria-label="Type: all types"]')!)
    expect(buttonNamed('All types1')).toBeDefined()
  })
  it('only includes the eligible beta module in comparisons when beta access is present', () => {
    const props = { ids: ['airwindows-chorus', 'everb'], selected: [], digiSelected: library.digiSelected, onToggle: noop, onToggleDigi: noop, onClose: noop }
    const count = (betaAccess: boolean) => renderToStaticMarkup(createElement(ModuleComparison, { ...props, betaAccess })).match(/<th scope="col">/g)?.length
    expect(count(false)).toBe(2)
    expect(count(true)).toBe(3)
  })
})
