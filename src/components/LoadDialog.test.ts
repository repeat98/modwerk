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
import { asBeta } from '../catalog/beta-fixture'
import { CommunityContext, emptySession } from '../community/context'
import type { Session } from '../community/api'
import { MODULES } from '../catalog/modules'
import { moduleCaution } from '../catalog/module-cautions'
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
async function open(set: ReturnType<typeof newConfiguration>, session: Session = emptySession, onEdit = vi.fn(), putBack = false, comesBackOn: string[] = []) {
  const prepareUpdate = vi.fn(async () => ({ name: set.name, changes: [] }))
  await act(() => root.render(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
    createElement(LoadDialog, { link, set, inventory, putBack, comesBackOn, prepareUpdate, onInstallBase() {}, onClose() {}, onEdit, onReport() {} }))))
  return { prepareUpdate, onEdit }
}

describe('putting modules back after a base update', () => {
  it('names the modules that were switched off, since they come back on', async () => {
    review.mockImplementation(target => ({ changes: { ...noChanges, add: target.moduleIds }, updates: [], needsSync: true, problem: undefined }))
    await open(newConfiguration('From my Octatrack', ['everb', 'tapeecho']), emptySession, vi.fn(), true, ['tapeecho'])
    expect(container.textContent).toContain('started without your modules')
    expect(container.textContent).toMatch(/Tape ?Echo was switched off on your Octatrack and comes back on\. To switch it off again, use PROJECT › MODWERK › MODULES after the sync\./i)
    await act(() => root.unmount()); root = createRoot(container)
    await open(newConfiguration('From my Octatrack', ['everb']), emptySession, vi.fn(), true)
    expect(container.textContent).not.toContain('switched off')
  })
})

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

  it('says why the modules a unit held past the limit before a base update can’t all be put back', async () => {
    review.mockImplementation(target => ({ changes: { ...noChanges, add: target.moduleIds }, updates: [], needsSync: true, problem: undefined }))
    const { onEdit } = await open(newConfiguration('From my Octatrack', ids.slice(0, over)), emptySession, vi.fn(), true)
    expect(container.querySelector('.load-blocked[role="alert"] p')?.textContent).toBe(`Your Octatrack had ${over} modules before the update; ${SET_MODULE_LIMIT} is the limit for now. Choose which to put back.`)
    expect(button('Sync to Octatrack')?.disabled).toBe(true)
    await act(async () => button('Edit From my Octatrack')!.click())
    expect(onEdit).toHaveBeenCalled()
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
  it('is paused for a member who is not a beta tester', () => asBeta(async () => {
    await open(chorus)
    expect(container.textContent).toMatch(/Air Chorus is paused for now/)
    expect(button('Sync to Octatrack')?.disabled).toBe(true)
  }))
  it('syncs for a beta tester', () => asBeta(async () => {
    await open(chorus, tester)
    expect(container.textContent).not.toMatch(/paused for now/)
    expect(button('Sync to Octatrack')?.disabled).toBe(false)
  }))
})

describe('a sync that removes or updates modules', () => {
  it('says before the sync that a track must not use them, the most common refusal', async () => {
    review.mockReturnValue({ changes: { ...noChanges, remove: ['tapeecho'] }, updates: ['everb'], needsSync: true, problem: undefined })
    await open(newConfiguration('Less', ['everb']))
    const hint = container.querySelector('.load-in-use')?.textContent ?? ''
    expect(hint).toContain('Before you sync: a track can’t keep a module that leaves or is updated.')
    expect(hint).toMatch(/Tape ?Echo/i); expect(hint).toMatch(/E-?Verb/i)
    expect(hint).toContain('check the bank’s other Parts too')
  })
  it('says nothing of tracks when the sync only adds', async () => {
    review.mockReturnValue({ changes: { ...noChanges, add: ['everb'] }, updates: [], needsSync: true, problem: undefined })
    await open(newConfiguration('More', ['everb']))
    expect(container.querySelector('.load-in-use')).toBeNull()
  })
  it('goes back to the review after a failed sync, so it can be tried again without closing', async () => {
    review.mockReturnValue({ changes: { ...noChanges, remove: ['tapeecho'] }, updates: [], needsSync: true, problem: undefined })
    vi.mocked(link.update).mockRejectedValueOnce(new Error('refused'))
    const { prepareUpdate } = await open(newConfiguration('Less', []))
    await act(async () => button('Sync to Octatrack')!.click())
    await vi.waitFor(() => expect(container.textContent).toContain('This module set couldn’t be synced.'))
    expect(button('Report a problem')).toBeDefined()
    await act(async () => button('Try again')!.click())
    expect(container.textContent).not.toContain('couldn’t be synced')
    expect(button('Sync to Octatrack')?.disabled).toBe(false)
    await act(async () => button('Sync to Octatrack')!.click())
    expect(prepareUpdate).toHaveBeenCalledTimes(2); expect(link.update).toHaveBeenCalledTimes(2)
  })
})

describe('after a sync with a High or Heavy CPU module', () => {
  it('says the flagged modules are for the studio, not for live', async () => {
    const flagged = ids.find(id => moduleCaution(id))!, light = ids.find(id => !moduleCaution(id))!
    review.mockImplementation(target => ({ changes: { ...noChanges, add: target.moduleIds }, updates: [], needsSync: true, problem: undefined }))
    await open(newConfiguration('Live', [flagged, light]))
    expect(container.textContent).not.toContain('Studio only')
    await act(async () => button('Sync to Octatrack')!.click())
    const note = container.querySelector('.module-caution[role="note"]')!
    expect(note.querySelector('strong')?.textContent).toBe('Studio only, not for live')
    expect([...note.querySelectorAll('li')].map(item => item.firstChild?.textContent)).toEqual([MODULES.find(module => module.id === flagged)!.name])
    expect(note.querySelector('li .module-caution-badge')?.textContent).toContain(moduleCaution(flagged)!.badge)
    expect(note.querySelector('p')?.textContent).toBe('It puts a heavy load on the Octatrack and can drop out or crackle when a pattern gets busy. Before you play live, switch it off on the Octatrack in PROJECT › MODWERK › MODULES, or sync a set without it.')
    expect(container.querySelector('.success-note')).toBeNull()
    await act(() => root.unmount()); root = createRoot(container)
    await open(newConfiguration('Light', [light]))
    await act(async () => button('Sync to Octatrack')!.click())
    expect(container.querySelector('.success-note')?.textContent).toBe('Done.')
    expect(container.textContent).not.toContain('Studio only')
    await act(() => root.unmount()); root = createRoot(container)
    await open(newConfiguration('Streaming', [light, USB_AUDIO_MODULE]), tester)
    await act(async () => button('Sync to Octatrack')!.click())
    expect([...container.querySelectorAll('.module-caution li')].map(item => item.textContent)).toEqual([MODULES.find(module => module.id === USB_AUDIO_MODULE)!.name])
  })
})
