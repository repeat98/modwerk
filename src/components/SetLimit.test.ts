// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVAILABLE_MODULES } from '../catalog/availability'
import { MODULES } from '../catalog/modules'
import { DIGI_MODS } from '../devices/digi-mods'
import { moduleUsbOnly } from '../catalog/usb-only'
import { LIMIT_REACHED, limitBlock, SET_MODULE_LIMIT } from '../catalog/set-limit'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { ModuleCard } from './ModuleCard'
import { ModuleComparison } from './ModuleComparison'
import { ModuleGrid } from './ModuleGrid'
import { MissingNote } from './OctatrackUpdate'

const ids = AVAILABLE_MODULES.map(module => module.id).filter(id => id !== USB_AUDIO_MODULE && !moduleUsbOnly(id))
const over = SET_MODULE_LIMIT + 3, next = ids[over]
const none = () => {}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe('adding to a full Octatrack set', () => {
  it('shows a library card’s add button as unavailable, with the reason', async () => {
    const toggle = vi.fn()
    await act(() => root.render(createElement(ModuleCard, { module: MODULES.find(module => module.id === next)!, selected: false, baseline: null, compared: false, canCompare: true,
      onToggle: toggle, onCompare: none, block: limitBlock(next) })))
    const button = container.querySelector<HTMLButtonElement>('.add-button')!
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Full')
    expect(button.title).toBe(LIMIT_REACHED)
    expect(container.querySelector('.add-block-chip')?.textContent).toBe('Set full: ' + SET_MODULE_LIMIT + ' modules for now')
    button.click()
    expect(toggle).not.toHaveBeenCalled()
  })

  it('disables the comparison’s add button and says why', () => {
    const html = renderToStaticMarkup(createElement(ModuleComparison, { ids: [next, ids[0]], selected: ids.slice(0, SET_MODULE_LIMIT), digiSelected: Object.fromEntries(DIGI_MODS.map(mod => [mod.device, []])) as never,
      onToggle: none, onToggleDigi: none, onClose: none }))
    expect(html).toContain('disabled="" title="' + LIMIT_REACHED + '"')
    expect(html).toContain('<small>' + LIMIT_REACHED + '</small>')
    expect(html).toContain('>Added<')
  })

  it('shows the set’s count over the limit in its tiles, and Keep and Add as unavailable when full', () => {
    const grid = (set: string[], unit: string[] = []) => renderToStaticMarkup(createElement(ModuleGrid, { ids: set, inventory: { moduleIds: unit, removedStockFx: [] }, describe: () => '', onRemove: none, onKeep: none }))
    expect(grid(ids.slice(0, over))).toContain(`This set has ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 to sync.`)
    const full = grid(ids.slice(0, SET_MODULE_LIMIT), [next])
    expect(full).not.toContain('is the limit for now')
    expect(full).toContain('<small>' + LIMIT_REACHED + '</small>')
    expect(full).toMatch(/disabled="" aria-label="Keep [^"]+: Your set is full\. \d+ modules per set is a temporary limit/)
    const below = grid(ids.slice(0, SET_MODULE_LIMIT - 1), [next])
    expect(below).toContain('From the library')
    expect(below).not.toContain('disabled=""')
  })
})

describe('adding the modules a project needs to a set that can’t take them all', () => {
  it('shows the reason instead of Add to set, and adds none of them', () => {
    const note = (limit?: string) => renderToStaticMarkup(createElement(MissingNote, { needs: { names: ['A', 'B'], unknown: [], add: limit ? undefined : none, limit }, onSync: none }))
    expect(note()).toContain('>Add to set<')
    const refused = note(`Adding them would make 22 modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 2 first.`)
    expect(refused).toContain(`Adding them would make 22 modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 2 first.`)
    expect(refused).not.toContain('>Add to set<'); expect(refused).not.toContain('>Sync to Octatrack<')
  })
})
