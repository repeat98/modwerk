// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseUpdateRequired, ModuleSetError, moduleSetReview } from '../engine/elekloader/module-set'
import { OctatrackLink, type LinkState } from '../engine/elekloader/octatrack-link'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { newConfiguration } from '../config/workspace'
import { LoadDialog } from './LoadDialog'
import { OctatrackHub } from './OctatrackHub'

vi.mock('../engine/elekloader/module-set', async original => ({ ...await original<typeof import('../engine/elekloader/module-set')>(), moduleSetReview: vi.fn() }))
// No module that has a USB package is paused today: a test pauses one itself.
const pausedForTest = vi.hoisted(() => new Set<string>())
vi.mock('../catalog/availability', async original => {
  const real = await original<typeof import('../catalog/availability')>()
  return { ...real, isModuleAvailable: (id: string, beta = false) => !pausedForTest.has(id) && real.isModuleAvailable(id, beta) }
})
let root: Root, container: HTMLDivElement, link: OctatrackLink, stop: () => void
const set = newConfiguration('Studio', ['everb']), inventory = { moduleIds: ['everb'], removedStockFx: [] }
const changes = { add: [], remove: [], stockOff: [], stockOn: [] }
const review = vi.mocked(moduleSetReview)
const hubProps = { onSelect() {}, onNew() {}, onImport() {}, onSetAction() {}, onFill() {}, onSaveUnit() {}, onReport() {}, header: null, grid: null, card: null }
const button = (text: string) => [...container.querySelectorAll('button')].find(element => element.textContent === text)!
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sessionStorage.clear(); localStorage.clear()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  HTMLElement.prototype.scrollTo = () => {}
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const unit = fakeUnit(), actual = new OctatrackLink(unit.usb, fakeSession(unit))
  stop = actual.start()
  await vi.waitFor(() => expect(actual.getState().status).toBe('ready'))
  const state: LinkState = actual.getState()
  stop()
  // Keep a stable connected snapshot; sending remains an explicit observable seam.
  link = { getState: () => state, subscribe: () => () => {}, start: () => () => {}, update: vi.fn(async () => {}), health: async () => undefined } as unknown as OctatrackLink
  review.mockReturnValue({ changes, updates: ['everb'], needsSync: true, problem: undefined })
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); pausedForTest.clear() })
async function load(prepareUpdate = vi.fn(async () => ({ name: set.name, changes: [] }))) {
  const install = vi.fn()
  await act(() => root.render(createElement(LoadDialog, { link, set, inventory, prepareUpdate, onInstallBase: install, onClose() {}, onEdit() {}, onCard() {}, onReport() {} })))
  return { prepareUpdate, install }
}
describe('runtime package upgrade review', () => {
  it('enables a same-member layout update and lists it once as Updates', async () => {
    const { prepareUpdate } = await load()
    expect(container.textContent).toContain('Adds 0 · Removes 0 · Updates 1')
    expect(container.querySelectorAll('.load-change')).toHaveLength(1)
    expect(container.querySelector('.load-change')?.textContent).toContain('Updates')
    expect(container.querySelector('.load-unchanged')).toBeNull()
    // The base presses STOP itself, so the dialog says so instead of asking for a tick.
    expect(container.querySelector('input[type=checkbox]')).toBeNull()
    expect(container.textContent).toContain('Syncing stops playback on the Octatrack.')
    await act(async () => button('Sync to Octatrack').click())
    expect(prepareUpdate).toHaveBeenCalledWith(set)
    expect(link.update).toHaveBeenCalledTimes(1)
  })
  it('holds back a paused module but still lets a sync remove it', async () => {
    pausedForTest.add('poly8')
    review.mockReturnValue({ changes: { ...changes, add: ['poly8'] }, updates: [], needsSync: true, problem: undefined })
    const { prepareUpdate } = await load()
    expect(container.querySelector('.load-blocked')?.textContent).toContain('POLY8 is paused for now')
    expect(button('Sync to Octatrack').disabled).toBe(true)
    expect(container.textContent).not.toContain('Syncing stops playback')
    review.mockReturnValue({ changes: { ...changes, remove: ['poly8'] }, updates: [], needsSync: true, problem: undefined })
    await load(prepareUpdate)
    expect(container.querySelector('.load-blocked')).toBeNull()
    await act(async () => button('Sync to Octatrack').click())
    expect(prepareUpdate).toHaveBeenCalledWith(set)
  })
  it('reviews against the connected base, as the hub does, so base-bound packages are not taken for an old base', async () => {
    await load()
    const { identity } = link.getState()
    expect(identity?.base).toMatch(/^[0-9a-f]{64}$/)
    expect(review).toHaveBeenCalledWith(set, inventory, identity?.capabilities, identity?.base)
  })
  it('offers the base installer before preparation or sending', async () => {
    review.mockReturnValue({ changes, updates: ['everb'], needsSync: true, problem: new BaseUpdateRequired() })
    const { prepareUpdate, install } = await load()
    expect(container.querySelector('[role=alert]')?.textContent).toContain('latest Modwerk base')
    expect(container.textContent).not.toContain('Syncing stops playback')
    await act(() => button('Install latest base').click())
    expect(install).toHaveBeenCalledOnce()
    expect(prepareUpdate).not.toHaveBeenCalled(); expect(link.update).not.toHaveBeenCalled()
  })
  it('preserves a typed preparation refusal as a review with an install action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const prepare = vi.fn(async () => { throw new BaseUpdateRequired() })
    const { install } = await load(prepare)
    await act(async () => button('Sync to Octatrack').click())
    expect(container.textContent).not.toContain('Done.')
    expect(container.querySelector('[role=alert]')?.textContent).toContain('latest Modwerk base')
    await act(() => button('Install latest base').click())
    expect(install).toHaveBeenCalledOnce(); expect(link.update).not.toHaveBeenCalled()
  })
  it('keeps other package refusals blocked without advertising an upgrade fix', async () => {
    review.mockReturnValue({ changes, updates: [], needsSync: false, problem: new ModuleSetError('This package is unavailable.') })
    const { prepareUpdate } = await load()
    expect(container.querySelector('[role=alert]')?.textContent).toBe('This package is unavailable.')
    expect(button('Install latest base')).toBeUndefined()
    expect((button('Sync to Octatrack') as HTMLButtonElement).disabled).toBe(true)
    expect(prepareUpdate).not.toHaveBeenCalled()
  })
  it('does not send a package prepared after the sync dialog closes', async () => {
    let finish!: (value: { name: string; changes: [] }) => void
    const preparing = new Promise<{ name: string; changes: [] }>(resolve => { finish = resolve })
    await load(vi.fn(() => preparing))
    await act(() => button('Sync to Octatrack').click())
    expect(container.textContent).toContain('Preparing your modules')
    await act(() => root.render(null))
    await act(async () => finish({ name: set.name, changes: [] }))
    expect(link.update).not.toHaveBeenCalled()
  })
  it('returns to review if the selected set changes while fetching packages', async () => {
    let finish!: (value: { name: string; changes: [] }) => void
    const preparing = new Promise<{ name: string; changes: [] }>(resolve => { finish = resolve })
    const prepareUpdate = vi.fn(() => preparing)
    await load(prepareUpdate)
    await act(() => button('Sync to Octatrack').click())
    const changed = { ...set, moduleIds: ['everb', 'tapehead'] }
    await act(() => root.render(createElement(LoadDialog, {link,set:changed,inventory,prepareUpdate,onInstallBase(){},onClose(){},onEdit(){},onCard(){},onReport(){}})))
    await act(async () => finish({ name: set.name, changes: [] }))
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Review the sync again; nothing was sent')
    expect(link.update).not.toHaveBeenCalled()
    expect((button('Sync to Octatrack') as HTMLButtonElement).disabled).toBe(false)
  })
  it('returns to review if the USB connection changes while fetching packages', async () => {
    let finish!: (value: { name: string; changes: [] }) => void
    const preparing = new Promise<{ name: string; changes: [] }>(resolve => { finish = resolve })
    await load(vi.fn(() => preparing))
    await act(() => button('Sync to Octatrack').click())
    const replacement: LinkState = { ...link.getState() }
    vi.spyOn(link, 'getState').mockReturnValue(replacement)
    await act(async () => finish({ name: set.name, changes: [] }))
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Review the sync again; nothing was sent')
    expect(link.update).not.toHaveBeenCalled()
    expect((button('Sync to Octatrack') as HTMLButtonElement).disabled).toBe(false)
  })
  it('keeps the hub action enabled for changed packages with unchanged member IDs', async () => {
    const sync = vi.fn(), install = vi.fn()
    // Only the open page's buttons: hidden pages stay mounted.
    const button = (text: string) => [...container.querySelectorAll('.hub-view:not([hidden]) button')].find(element => element.textContent === text) as HTMLButtonElement
    await act(() => root.render(createElement(OctatrackHub, { ...hubProps, view: 'set', link, inventory, sets: [set], selectedId: set.id, onSync: sync, onInstall: install })))
    expect(container.querySelector('.hub-sync')?.textContent).toContain('Updates 1')
    expect((button('Sync to Octatrack') as HTMLButtonElement).disabled).toBe(false)
    await act(() => button('Sync to Octatrack').click())
    expect(sync).toHaveBeenCalledWith(set.id)
    expect(install).not.toHaveBeenCalled()
    review.mockReturnValue({ changes, updates: ['everb'], needsSync: true, problem: new BaseUpdateRequired() })
    await act(() => root.render(createElement(OctatrackHub, { ...hubProps, view: 'set', link, inventory, sets: [set], selectedId: set.id, onSync: sync, onInstall: install })))
    await act(() => button('Install latest base').click())
    expect(sync).toHaveBeenLastCalledWith(set.id); expect(install).toHaveBeenCalledOnce()
  })
})
