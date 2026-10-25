// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newConfiguration } from '../config/workspace'
import { recordSync } from '../config/octatrack-progress'
import { moduleSetReview } from '../engine/elekloader/module-set'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { DiagnosticReading } from '../community/octatrack-diagnostics-contract'
import { OctatrackHub, type HubView } from './OctatrackHub'
import { OctatrackActivity } from './OctatrackStatus'
import { recordLoad } from '../hooks/useOctatrackLoad'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }

vi.mock('./OctatrackDiagnostics', () => ({ OctatrackDiagnosticsSettings: () => null }))
vi.mock('../engine/elekloader/module-set', async original => ({ ...await original<typeof import('../engine/elekloader/module-set')>(), moduleSetReview: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear() })

const ready: LinkState = { status: 'ready', identity: { canSubmit: true, base: baseBinding.identity, model: 'OCTATRACK MKII' } }
const reading: DiagnosticReading = { state: 3, failed: 4, modules: 2, dsp: 1, intact: 2, ran: 1, cpu: 412, tracks1to4: 238, tracks5to8: 655, frameGap: 47900, saved: 7, savedCount: 2, live: 2, culprit: 0, refusal: 0 }
function unit(state: LinkState = ready) {
  return { getState: () => state, subscribe: () => () => {}, start: () => () => {}, update: vi.fn(), health: vi.fn(async () => reading), liveLoad: vi.fn(async () => undefined), savedBackup: vi.fn(async () => undefined), test: vi.fn(async () => 'the Octatrack couldn’t start it; stop playback and try again') } as unknown as OctatrackLink & { health: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const callbacks = () => ({ onSelect: vi.fn(), onSync: vi.fn(), onInstall: vi.fn(), onNew: vi.fn(), onImport: vi.fn(), onSetAction: vi.fn(), onFill: vi.fn(), onSaveUnit: vi.fn(), onReport: vi.fn() })
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove() })
const open = () => container.querySelector<HTMLElement>('.hub-view:not([hidden])')!
const button = (text: string) => [...open().querySelectorAll('button')].find(element => element.textContent === text)!

describe('the Octatrack page', () => {
  it('lists the unit’s pages and the sets, and only the guided sync sends anything', async () => {
    const first = newConfiguration('Live', ['miniverb']), second = newConfiguration('Studio', ['synth'])
    const link = unit(), props = callbacks(), inventory = { moduleIds: ['miniverb'], removedStockFx: [] }
    vi.mocked(moduleSetReview).mockReturnValue({ changes: { add: ['synth'], remove: ['miniverb'], stockOff: [], stockOn: [] }, updates: [], needsSync: true, problem: undefined })
    const render = (view: HubView, selectedId = first.id) => act(() => root.render(createElement(OctatrackHub, { ...props, view, link, inventory, sets: [first, second], selectedId, header: null, grid: createElement('p', null, 'Module grid'), card: null })))
    await render('status')
    expect([...container.querySelectorAll('.hub-nav-item')].map(item => item.textContent)).toEqual(['Status', 'Backups', 'SamplesWIP', 'Setup'])
    expect(container.querySelector('.hub-nav-item[aria-current="page"]')?.textContent).toBe('Status')
    expect(container.querySelectorAll('.hub-view:not([hidden])')).toHaveLength(1)
    expect(container.querySelector('.hub-set.is-selected em')?.textContent).toBe('Editing · On your Octatrack')
    // The compact picker opens a set; the list's rows do the same.
    const picker = container.querySelector<HTMLSelectElement>('.hub-set-picker')!
    await act(() => { picker.value = 'set:' + second.id; picker.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(props.onSelect).toHaveBeenCalledWith(second.id)
    await render('set', second.id)
    expect(container.querySelector('.hub-hero h2')?.textContent).toBe('Octatrack MKII')
    expect(container.querySelector('.hub-nav-item[aria-current="page"]')).toBeNull()
    expect(container.querySelector('.hub-set-open[aria-current="page"] strong')?.textContent).toBe('Studio')
    expect(open().querySelector('h2')?.textContent).toBe('Studio')
    expect(open().querySelector('.hub-sync')?.textContent).toContain('Adds 1 · Removes 1')
    expect(vi.mocked(moduleSetReview)).toHaveBeenLastCalledWith(second, inventory, undefined, ready.identity?.base)
    expect(props.onSync).not.toHaveBeenCalled(); expect(link.update).not.toHaveBeenCalled()
    await act(() => button('Sync to Octatrack').click())
    expect(props.onSync).toHaveBeenCalledExactlyOnceWith(second.id); expect(link.update).not.toHaveBeenCalled()
  })

  it('asks a unit on an older base to install the current one before anything syncs', async () => {
    const set = newConfiguration('Live', ['miniverb']), props = callbacks(), inventory = { moduleIds: [], removedStockFx: [] }
    const link = unit({ status: 'ready', identity: { canSubmit: true, base: 'a'.repeat(64), model: 'OCTATRACK MKII' } })
    vi.mocked(moduleSetReview).mockReturnValue({ changes: { add: ['miniverb'], remove: [], stockOff: [], stockOn: [] }, updates: [], needsSync: true, problem: undefined })
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'set', link, inventory, sets: [set], selectedId: set.id, header: null, grid: null, card: null })))
    expect(open().querySelector('.hub-sync')?.textContent).toContain('Install the latest Modwerk base')
    await act(() => button('Install latest base').click())
    expect(props.onInstall).toHaveBeenCalledOnce(); expect(link.update).not.toHaveBeenCalled()
  })
  it('acts on one set from its row menu and starts an empty set from what is on the unit', async () => {
    const live = newConfiguration('Live', ['miniverb']), empty = newConfiguration('Empty', [])
    const props = callbacks(), inventory = { moduleIds: ['miniverb', 'synth'], removedStockFx: [] }
    vi.mocked(moduleSetReview).mockReturnValue({ changes: { add: [], remove: ['miniverb', 'synth'], stockOff: [], stockOn: [] }, updates: [], needsSync: true, problem: undefined })
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'set', link: unit(), inventory, sets: [live, empty], selectedId: empty.id, header: null, grid: null, card: null })))
    const row = [...container.querySelectorAll('.hub-set')].find(item => item.textContent?.includes('Live'))!
    await act(() => row.querySelector<HTMLButtonElement>('.hub-set-menu .icon-button')!.click())
    expect(row.querySelector('[role="group"]')?.textContent).toBe('RenameDuplicateExport JSONShare in forumDelete')
    await act(() => [...row.querySelectorAll('button')].find(item => item.textContent === 'Export JSON')!.click())
    expect(props.onSetAction).toHaveBeenCalledExactlyOnceWith(live.id, 'export')
    expect(open().querySelector('.hub-fill')?.textContent).toContain('remove the 2 modules on your Octatrack')
    await act(() => button('Start from what’s on it').click())
    expect(props.onFill).toHaveBeenCalledWith(['miniverb', 'synth'])
    await act(() => [...container.querySelectorAll<HTMLButtonElement>('.hub-nav-foot button')].find(item => item.textContent === 'New module set')!.click())
    expect(props.onNew).toHaveBeenCalledOnce()
  })

  it('shows the unit’s status from its own records and this browser’s syncs', async () => {
    const set = newConfiguration('Live', ['miniverb', 'synth']), link = unit(), props = callbacks()
    // The app records the load on every page; Status shows what it recorded.
    const stop = recordLoad(link as unknown as OctatrackLink); await act(async () => {})
    recordSync({ name: 'Live', modules: 2, outcome: 'failed', message: 'The stress test failed.' }, '2026-10-13T10:00:00.000Z')
    recordSync({ name: 'Live', modules: 2, outcome: 'kept' }, '2026-10-13T11:00:00.000Z')
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'status', link, inventory: { moduleIds: ['miniverb', 'synth'], removedStockFx: [] }, sets: [set], selectedId: set.id, header: null, grid: null, card: null })))
    expect(link.health).toHaveBeenCalledOnce()
    // The hero stays above every page; Status is one panel of cells.
    expect(container.querySelector('.hub-hero [role="status"]')?.textContent).toBe('Connected · 2 modules on it · same as Live')
    const status = open().textContent!
    expect(status).toContain('Saved and checked · 2 modules')
    expect(status).toContain('Failed: the Octatrack’s DSP stopped')
    expect([...open().querySelectorAll('.hub-peaks dd')].map(item => item.textContent)).toEqual(['41%', '24%', '66%'])
    expect(status).toContain('Live load needs a newer Modwerk base')
    stop()
    // A self-test can be started from here; when the base won’t start it, Status says why.
    await act(async () => button('Run self-test').click())
    expect(link.test).toHaveBeenCalledOnce(); expect(open().textContent).toContain('The Octatrack couldn’t start it; stop playback and try again.')
    expect([...open().querySelectorAll('.hub-console > *')].map(cell => cell.className.split(' ').pop())).toEqual(['hub-cell-cpu', 'hub-cell-dsp1', 'hub-cell-dsp2', 'hub-cell-chart', 'hub-cell-health', 'hub-cell-unit', 'hub-cell-history'])
    expect([...open().querySelectorAll('.hub-history li strong')].map(item => item.textContent)).toEqual(['Live', 'Live'])
    await act(() => button('Report a problem').click())
    expect(props.onReport).toHaveBeenCalledWith(set.id)
    expect(link.update).not.toHaveBeenCalled()
  })

  it('says when not every saved module came back at startup', async () => {
    const set = newConfiguration('Live', ['miniverb', 'synth']), link = unit(), props = callbacks()
    link.health.mockResolvedValue({ ...reading, saved: 6, savedCount: 1 })
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'status', link, inventory: { moduleIds: ['miniverb'], removedStockFx: [] }, sets: [set], selectedId: set.id, header: null, grid: null, card: null })))
    expect(open().textContent).toContain('Not all loaded at startup · 1 module running. Sync your modules to put the rest back.')
  })

  it('keeps local samples while other pages open, and pauses their preview', async () => {
    const createURL = vi.fn(() => 'blob:hub-sample'), revokeURL = vi.fn(), pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createURL; static revokeObjectURL = revokeURL })
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Local sample selection must not use the API') }))
    const config = newConfiguration('Live', ['miniverb']), link = unit(), props = callbacks()
    vi.mocked(moduleSetReview).mockReturnValue({ changes: { add: ['miniverb'], remove: [], stockOff: [], stockOn: [] }, updates: [], needsSync: true, problem: undefined })
    const render = (view: HubView) => act(() => root.render(createElement(OctatrackHub, { ...props, view, link, inventory: { moduleIds: [], removedStockFx: [] }, sets: [config], selectedId: config.id, header: null, grid: null, card: null })))
    await render('samples')
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Choose sample files"]')!
    Object.defineProperty(input, 'files', { value: [new File(['local'], 'kick.wav', { type: 'audio/wav' })], configurable: true })
    await act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
    await act(() => container.querySelector<HTMLButtonElement>('.samples-tree button')!.click())
    expect(createURL).toHaveBeenCalledTimes(1); expect(container.querySelector('audio')?.autoplay).toBe(false)
    pause.mockClear()
    await render('set')
    expect(container.querySelector<HTMLElement>('.hub-view-samples')!.hidden).toBe(true); expect(pause).toHaveBeenCalledTimes(1)
    await render('samples')
    expect(open().textContent).toContain('kick.wav'); expect(createURL).toHaveBeenCalledTimes(1); expect(revokeURL).not.toHaveBeenCalled()
    expect(props.onSync).not.toHaveBeenCalled(); expect(link.update).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })

  it('opens Samples and Setup without USB support or a module set', async () => {
    const props = callbacks()
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'samples', link: null, sets: [], header: null, grid: null, card: createElement('p', null, 'Card route') })))
    expect(open().textContent).toContain('No USB connection is needed')
    expect(open().querySelector<HTMLButtonElement>('.samples-actions button')?.disabled).toBe(false)
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'setup', link: null, sets: [], header: null, grid: null, card: createElement('p', null, 'Card route') })))
    expect(open().textContent).toContain('This browser can’t use USB'); expect(open().textContent).toContain('Card route')
    expect(open().textContent).not.toContain('Can’t connect?')
    await act(() => root.render(createElement(OctatrackHub, { ...props, view: 'set', link: null, sets: [], header: null, grid: null, card: null })))
    await act(() => button('New module set').click())
    expect(props.onNew).toHaveBeenCalledOnce(); expect(props.onSync).not.toHaveBeenCalled(); expect(props.onInstall).not.toHaveBeenCalled()
  })
})
describe('link results outside the sync dialog', () => {
  it('shows why the unit could not be opened in the hero, with a way to try again', async () => {
    const link = unit({ status: 'idle', notice: { tone: 'error', text: 'Chrome couldn’t open the Octatrack. Unplug it, plug it back in and try again.' } })
    await act(() => root.render(createElement(OctatrackHub, { ...callbacks(), view: 'status', link, sets: [], header: null, grid: null, card: null })))
    expect(container.querySelector('.hub-hero [role=status]')?.textContent).toContain('Chrome couldn’t open the Octatrack')
    expect([...container.querySelectorAll('.hub-hero button')].map(item => item.textContent)).toEqual(['Connect'])
  })
  it('gives Linux and Windows their own connection steps in Setup', async () => {
    await act(() => root.render(createElement(OctatrackHub, { ...callbacks(), view: 'setup', link: unit({ status: 'idle' }), sets: [], header: null, grid: null, card: null })))
    expect(open().textContent).toContain('Can’t connect?')
    expect(open().querySelector('.hub-code')?.textContent).toContain('ATTR{idVendor}=="1935", TAG+="uaccess"')
    expect(open().textContent).toContain('only once it runs the Modwerk base')
  })
  it('does not repeat a result the sync dialog already showed, and still shows one that arrives on this page', async () => {
    let state: LinkState = { ...ready, notice: { tone: 'success', text: 'Kept. Live stays on your Octatrack, also after a restart.' } }
    const listeners = new Set<() => void>(), link = { ...unit(), getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
    await act(() => root.render(createElement(OctatrackActivity, { link: link as unknown as OctatrackLink })))
    expect(container.querySelector('.octatrack-activity')).toBeNull()
    await act(() => { state = { ...ready, status: 'trial', module: 'Studio' }; listeners.forEach(listener => listener()) })
    await act(() => { state = { ...ready, notice: { tone: 'success', text: 'Kept. Studio stays on your Octatrack, also after a restart.' } }; listeners.forEach(listener => listener()) })
    expect(container.querySelector('.octatrack-activity')?.textContent).toContain('Kept. Studio stays')
  })
})
