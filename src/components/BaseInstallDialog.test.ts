// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadUnconfirmedError } from '../engine/elekloader/upload-session'
import { BaseInstallDialog } from './BaseInstallDialog'
import { layoutIdentity } from '../engine/elekloader/base-variants'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import type { InventoryTarget } from '../config/inventory'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('navigator', {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = () => {}
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)))

describe('the base dialog for a unit on an older base', () => {
  async function older(updatesBase: boolean, slots?: Uint8Array, extra: { base?: string; set?: InventoryTarget } = {}) {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    unit.base = extra.base ?? 'cc'.repeat(32); unit.updatesBase = updatesBase; unit.slots = slots
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const expected = 'ab'.repeat(32), bin = new Uint8Array([1, 2, 3, 4])
    const update = vi.spyOn(link, 'updateBase').mockImplementation(async (_bin, _base, report) => { report?.('staging', 0.5); report?.('done') })
    const onReady = vi.fn(), buildBase = vi.fn(async () => ({ buffer: bin.buffer, sha256: 'x', base: expected }))
    await act(() => root.render(createElement(BaseInstallDialog, { link, set: extra.set, firmwareReady: true, onChooseFirmware: () => {}, buildBase, onClose: () => {}, onReady })))
    return { unit, link, update, onReady, expected, bin, buildBase }
  }
  it('updates over USB when the base can write itself: build, then the link’s trial and write, then the set', async () => {
    const { update, onReady, expected, bin } = await older(true)
    expect(container.textContent).toContain('Update over USB')
    expect(buttonNamed('Download base .bin')).toBeUndefined()
    const button = buttonNamed('Update over USB')!
    expect(button.disabled).toBe(true)
    click(container.querySelector('.risk-accept input')!)
    expect(button.disabled).toBe(false)
    click(button); await settle(); await settle()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toEqual(bin); expect(update.mock.calls[0][1]).toBe(expected)
    expect(container.textContent).toContain('Done. The new base is saved')
    expect(onReady).not.toHaveBeenCalled()
    click(buttonNamed('Continue')!)
    expect(onReady).toHaveBeenCalledTimes(1)
  })
  it('with one copy of the base, names Send, Restart, Save and one restart first, then tracks them, still as an update while the unit runs the new base', async () => {
    const { unit, link, update, expected } = await older(true)
    expect([...container.querySelectorAll('.base-update-plan strong')].map(item => item.textContent)).toEqual(['Send', 'Restart', 'Save'])
    expect(container.textContent).toContain('Your Octatrack restarts once')
    expect(container.textContent).toContain('Save your project and stop playback first.')
    const status = container.querySelector('[role="status"]')! // in place before the update, so its first step is announced
    expect(status.textContent).toBe('')
    let resume = () => {}
    update.mockImplementation(async (_bin, _base, report) => {
      report?.('starting')
      unit.unplug(); unit.base = expected; unit.plug() // the one restart: the unit comes back on the new base, nothing saved yet
      await vi.waitFor(() => expect(link.getState().identity?.base).toBe(expected))
      report?.('writing', 0.5)
      await new Promise<void>(resolve => { resume = resolve })
      report?.('done')
    })
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!)
    await vi.waitFor(() => expect(container.textContent).toContain('Sending the base once more'))
    expect(container.querySelector('h2')!.textContent).toContain('Update the Modwerk base')
    expect(container.querySelector('.base-install-intro code')!.textContent).toBe('cc'.repeat(4))
    expect(container.querySelector('.base-update-plan .is-active strong')!.textContent).toBe('Save')
    expect(container.querySelectorAll('.base-update-plan .is-complete')).toHaveLength(2)
    expect(container.querySelector('[role="status"]')).toBe(status)
    expect(status.textContent).toContain('Nothing is saved yet')
    expect(status.textContent).not.toContain('%') // the bar carries the value; the status changes only with the step
    // Hands off, for as long as it runs: after its restart the unit looks ready while nothing is saved.
    const handsOff = container.querySelector('.base-update-hands-off')!
    expect(handsOff.getAttribute('role')).toBe('alert')
    expect(handsOff.textContent).toContain('Hands off your Octatrack')
    expect(handsOff.textContent).toContain('can look ready before the base is saved')
    // One bar for the whole update, always there while it runs: halfway through the second send is two thirds.
    const bar = container.querySelector('.base-update-overall [role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('67')
    expect(bar.className).toContain('is-busy')
    expect(container.querySelector('.base-update-overall .progress-value')!.textContent).toBe('67%')
    expect(container.querySelector('progress')).toBeNull() // the browser's own bar was too faint to see
    expect([...container.querySelectorAll('.base-update-plan .is-complete .sr-only')].map(item => item.textContent)).toEqual([' (done)', ' (done)'])
    expect(container.querySelector('.base-install-recovery')).toBeNull() // the before-start notes give way to the progress
    expect(container.querySelector('.base-install-close')).toBeNull()
    expect(buttonNamed('Continue')).toBeUndefined()
    await act(async () => resume()); await settle()
    expect(container.textContent).toContain('Done. The new base is saved')
    expect(container.querySelectorAll('.base-update-plan .is-complete')).toHaveLength(3)
    expect(container.querySelector('.base-update-overall [role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
    expect(container.querySelector('.base-update-hands-off')).toBeNull()
    expect(buttonNamed('Continue')).toBeDefined()
  })
  // A base writing another base's container quiesces stock, and a stall then hung units (30 October 2026): on two slots
  // the new base also starts from RAM and saves itself.
  it('on two slots, names Send, Restart, Save as with one copy', async () => {
    const twoSlots = Uint8Array.from([0x4d, 0x57, 0x53, 0x53, 1, 0, 2, ...new Array(17).fill(0)]) // SLOTS: "MWSS", two slots, running A, confirmed
    const { link } = await older(true, twoSlots)
    await vi.waitFor(() => expect(link.getState().slots?.layout).toBe('two'))
    expect([...container.querySelectorAll('.base-update-plan strong')].map(item => item.textContent)).toEqual(['Send', 'Restart', 'Save'])
  })
  it('offers the USB update from any older base, and the card steps after a failure', async () => {
    const { update } = await older(false)
    update.mockImplementation(async () => { throw new Error('The Octatrack did not come back within 90 s.') })
    expect(buttonNamed('Update over USB')).toBeDefined(); expect(buttonNamed('Download base .bin')).toBeUndefined()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(container.textContent).toContain('did not come back within 90 s')
    click(buttonNamed('Update from the card')!)
    expect(buttonNamed('Download base .bin')).toBeDefined()
    expect(container.textContent).toContain('from the card, the same way as the first time')
  })
  it('says a transport failure in plain words, not the session’s own text', async () => {
    const { update } = await older(true)
    update.mockImplementation(async () => { throw new UploadUnconfirmedError('hello was not confirmed; no further commands will be sent on this connection.') })
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(container.textContent).toContain('The update stopped.')
    expect(container.textContent).toContain('The Octatrack stopped answering. Nothing was saved: your Octatrack keeps its current base.')
    expect(container.querySelector('.base-update-plan .is-failed strong')!.textContent).toBe('Send')
    expect(container.textContent).not.toContain('hello was not confirmed')
  })
  it('asks for a reload instead of sending its base when the site was deployed since the page opened', async () => {
    const script = Object.assign(document.createElement('script'), { type: 'module' }); script.setAttribute('src', './assets/index-old.js'); document.head.append(script)
    try {
      vi.stubGlobal('fetch', async () => new Response('<script type="module" crossorigin src="./assets/index-new.js"></script>'))
      const { update } = await older(true); await settle()
      expect(container.textContent).toContain('Modwerk was updated since you opened this page')
      expect(container.textContent).not.toContain('has an older one')
      expect(buttonNamed('Update over USB')).toBeUndefined(); expect(buttonNamed('Reload page')).toBeDefined()
      expect(update).not.toHaveBeenCalled()
    } finally { script.remove() }
  })
  // The previous base's default (500cdb6f…) ran USB Audio in tracks-main-cue; its `off` variant ran none.
  const previousDefault = '500cdb6fd81bfc9c2b18737e7487f3ec2264c1c00c5ebef833e7f751e325d1b7', previousOff = '05b7f09031bc3892626e7c2576810386faeb01bd3a3101353a56c56c96d82a4a'
  const audioOff = 'USB Audio is off in this base by default. To keep using it, add the USB Audio module to your module set first; the update then installs your layout.'
  const runUpdate = async () => { click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle() }
  it('keeps the USB Audio layout the set asks for, in one update, and says nothing about USB Audio going off', async () => {
    const set = { name: 'Live', moduleIds: ['everb', USB_AUDIO_MODULE], usbAudio: { layout: 'main' as const } }
    const { buildBase, update } = await older(true, undefined, { base: previousDefault, set })
    expect(container.textContent).toContain('with USB Audio · Main')
    expect(container.textContent).not.toContain(audioOff)
    await runUpdate()
    expect(buildBase.mock.calls).toEqual([['main']]); expect(update).toHaveBeenCalledTimes(1)
  })
  it('installs USB Audio off for a set without the USB Audio module, and says so first when the old base had USB Audio', async () => {
    const { buildBase } = await older(true, undefined, { base: previousDefault, set: { name: 'Live', moduleIds: ['everb'] } })
    expect(container.querySelector('.base-install-note[role="note"]')?.textContent).toBe(audioOff)
    await runUpdate()
    expect(buildBase.mock.calls).toEqual([[undefined]]) // session.ts builds MEMBER_LAYOUT: USB Audio off
  })
  it('says the same from an older base the site can’t tell', async () => {
    await older(true)
    expect(container.textContent).toContain(audioOff)
  })
  it('says nothing about USB Audio from the previous base’s USB-Audio-off variant', async () => {
    const { buildBase } = await older(true, undefined, { base: previousOff })
    expect(container.textContent).toContain('A new Modwerk base is out')
    expect(container.textContent).not.toContain(audioOff)
    await runUpdate()
    expect(buildBase.mock.calls).toEqual([[undefined]])
  })
})

describe('the base dialog for another USB Audio layout', () => {
  it('sends the current base in the set’s layout over USB, from a unit already on the current base', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    unit.base = layoutIdentity('tracks-main-cue')!
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const expected = layoutIdentity('main')!, bin = new Uint8Array([5, 6])
    const update = vi.spyOn(link, 'updateBase').mockImplementation(async (_bin, _base, report) => { report?.('done') })
    const buildBase = vi.fn(async () => ({ buffer: bin.buffer, sha256: 'y', base: expected }))
    await act(() => root.render(createElement(BaseInstallDialog, { link, layout: 'main', firmwareReady: true, onChooseFirmware: () => {}, buildBase, onClose: () => {}, onReady: () => {} })))
    expect(container.textContent).toContain('Change USB Audio')
    expect(container.textContent).toContain('USB Audio · Tracks + Main + Cue')
    expect(container.textContent).toContain('switching to USB Audio · Main updates the base over USB')
    expect(buttonNamed('Download base .bin')).toBeUndefined()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(buildBase).toHaveBeenCalledWith('main')
    expect(update.mock.calls[0][1]).toBe(expected)
  })
})
