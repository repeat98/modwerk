// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { moduleSetReview, USB_MODULE_IDS } from '../engine/elekloader/module-set'
import { OctatrackLink, type LinkState } from '../engine/elekloader/octatrack-link'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { newConfiguration } from '../config/workspace'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { SET_MODULE_LIMIT } from '../catalog/set-limit'
import { isModuleAvailable } from '../catalog/availability'
import { CommunityContext, emptySession } from '../community/context'
import type { Session } from '../community/api'
import { LoadDialog } from './LoadDialog'

vi.mock('../engine/elekloader/module-set', async original => ({ ...await original<typeof import('../engine/elekloader/module-set')>(), moduleSetReview: vi.fn() }))
const review = vi.mocked(moduleSetReview)
const ids = USB_MODULE_IDS.filter(id => id !== USB_AUDIO_MODULE && isModuleAvailable(id)), over = SET_MODULE_LIMIT + 3
const inventory = { moduleIds: [], removedStockFx: [] }
const noChanges = { add: [], remove: [], stockOff: [], stockOn: [] }
const tester = { available: true, admin: false, user: { id: 'u1', username: 'tester', verified: true, betaTester: true } } as unknown as Session
let root: Root, container: HTMLDivElement, link: OctatrackLink, stop: () => void
const button = (text: string) => [...container.querySelectorAll('button')].find(element => element.textContent === text)
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sessionStorage.clear(); localStorage.clear()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const unit = fakeUnit(), actual = new OctatrackLink(unit.usb, fakeSession(unit))
  stop = actual.start()
  await vi.waitFor(() => expect(actual.getState().status).toBe('ready'))
  const state: LinkState = actual.getState()
  stop()
  link = { getState: () => state, subscribe: () => () => {}, start: () => () => {}, update: vi.fn(async () => {}), health: async () => undefined } as unknown as OctatrackLink
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); stop(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function open(set: ReturnType<typeof newConfiguration>, session: Session = emptySession, onEdit = vi.fn()) {
  const prepareUpdate = vi.fn(async () => ({ name: set.name, changes: [] }))
  await act(() => root.render(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
    createElement(LoadDialog, { link, set, inventory, prepareUpdate, onInstallBase() {}, onClose() {}, onEdit, onCard() {}, onReport() {} }))))
  return { prepareUpdate, onEdit }
}

describe('syncing a set over the module limit', () => {
  it('opens a saved set with more modules, says how many to remove, and syncs once trimmed', async () => {
    review.mockImplementation(target => ({ changes: { ...noChanges, add: target.moduleIds }, updates: [], needsSync: true, problem: undefined }))
    const { prepareUpdate, onEdit } = await open(newConfiguration('Everything', ids.slice(0, over)))
    expect(container.textContent).toContain(`This set has ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 to sync.`)
    expect(container.textContent).toContain('Adds ' + over)
    expect(button('Sync to Octatrack')?.disabled).toBe(true)
    expect(container.textContent).not.toContain('Syncing stops playback')
    await act(async () => button('Edit Everything')!.click())
    expect(onEdit).toHaveBeenCalled()
    expect(prepareUpdate).not.toHaveBeenCalled()
    await act(() => root.unmount())
    root = createRoot(container)
    const trimmed = newConfiguration('Everything', ids.slice(0, SET_MODULE_LIMIT))
    const second = await open(trimmed)
    expect(container.textContent).not.toContain('is the limit for now')
    expect(button('Sync to Octatrack')?.disabled).toBe(false)
    await act(async () => button('Sync to Octatrack')!.click())
    expect(second.prepareUpdate).toHaveBeenCalledWith(trimmed)
  })

  it('still syncs a smaller set to a unit that holds more than the limit, removing the rest', async () => {
    review.mockReturnValue({ changes: { ...noChanges, remove: ids.slice(5, over) }, updates: [], needsSync: true, problem: undefined })
    const smaller = newConfiguration('Smaller', ids.slice(0, 5)), { prepareUpdate } = await open(smaller)
    expect(container.textContent).toContain('Removes ' + (over - 5))
    expect(container.textContent).not.toContain('is the limit for now')
    await act(async () => button('Sync to Octatrack')!.click())
    expect(prepareUpdate).toHaveBeenCalledWith(smaller)
  })

  it('says nothing about the limit when the unit already has exactly that set', async () => {
    review.mockReturnValue({ changes: noChanges, updates: [], needsSync: false, problem: undefined })
    await open(newConfiguration('Everything', ids.slice(0, over)))
    expect(container.textContent).toContain('Your Octatrack already has exactly these modules.')
    expect(container.textContent).not.toContain('is the limit for now')
  })
})

describe('a beta module in a saved set', () => {
  const chorus = newConfiguration('Chorus', ['airwindows-chorus'])
  beforeEach(() => review.mockReturnValue({ changes: { ...noChanges, add: ['airwindows-chorus'] }, updates: [], needsSync: true, problem: undefined }))
  it('is paused for a member who is not a beta tester', async () => {
    await open(chorus)
    expect(container.textContent).toMatch(/Air Chorus is paused for now/)
    expect(button('Sync to Octatrack')?.disabled).toBe(true)
  })
  it('syncs for a beta tester', async () => {
    await open(chorus, tester)
    expect(container.textContent).not.toMatch(/paused for now/)
    expect(button('Sync to Octatrack')?.disabled).toBe(false)
  })
})
