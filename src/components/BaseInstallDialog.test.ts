// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadUnconfirmedError } from '../engine/elekloader/upload-session'
import { BaseInstallDialog } from './BaseInstallDialog'
import { layoutIdentity } from '../engine/elekloader/base-variants'

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
  async function older(updatesBase: boolean, slots?: Uint8Array) {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    unit.base = 'cc'.repeat(32); unit.updatesBase = updatesBase; unit.slots = slots
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const expected = 'ab'.repeat(32), bin = new Uint8Array([1, 2, 3, 4])
    const update = vi.spyOn(link, 'updateBase').mockImplementation(async (_bin, _base, report) => { report?.('staging', 0.5); report?.('done') })
    const onReady = vi.fn(), buildBase = vi.fn(async () => ({ buffer: bin.buffer, sha256: 'x', base: expected }))
    await act(() => root.render(createElement(BaseInstallDialog, { link, firmwareReady: true, onChooseFirmware: () => {}, buildBase, onClose: () => {}, onReady })))
    return { unit, link, update, onReady, expected, bin }
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
    expect(container.textContent).toContain('Done. Your Octatrack runs the new base.')
    expect(onReady).not.toHaveBeenCalled()
    click(buttonNamed('Continue')!)
    expect(onReady).toHaveBeenCalledTimes(1)
  })
  it('with one copy of the base, names Send, Restart, Save and one restart first, then tracks them, still as an update while the unit runs the new base', async () => {
    const { unit, link, update, expected } = await older(true)
    expect([...container.querySelectorAll('.base-update-plan strong')].map(item => item.textContent)).toEqual(['Send', 'Restart', 'Save'])
    expect(container.textContent).toContain('Your Octatrack restarts once')
    expect(container.textContent).toContain('Save your project and stop playback first.')
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
    await vi.waitFor(() => expect(container.textContent).toContain('Saving the new base'))
    expect(container.querySelector('h2')!.textContent).toContain('Update the Modwerk base')
    expect(container.querySelector('.base-install-intro code')!.textContent).toBe('cc'.repeat(4))
    expect(container.querySelector('.base-update-plan .is-active strong')!.textContent).toBe('Save')
    expect(container.querySelectorAll('.base-update-plan .is-complete')).toHaveLength(2)
    expect(container.querySelector('[role="status"]')!.className).toBe('base-install-warning')
    expect(container.querySelector('.base-install-recovery')).toBeNull() // the before-start notes give way to the progress
    expect(container.querySelector('.base-install-close')).toBeNull()
    expect(buttonNamed('Continue')).toBeUndefined()
    await act(async () => resume()); await settle()
    expect(container.textContent).toContain('Done. Your Octatrack runs the new base.')
    expect(container.querySelectorAll('.base-update-plan .is-complete')).toHaveLength(3)
    expect(buttonNamed('Continue')).toBeDefined()
  })
  it('on two slots, names Send, Save, Restart, and says the container’s upload as the send', async () => {
    const twoSlots = Uint8Array.from([0x4d, 0x57, 0x53, 0x53, 1, 0, 2, ...new Array(17).fill(0)]) // SLOTS: "MWSS", two slots, running A, confirmed
    const { link, update } = await older(true, twoSlots)
    await vi.waitFor(() => expect(link.getState().slots?.layout).toBe('two'))
    expect([...container.querySelectorAll('.base-update-plan strong')].map(item => item.textContent)).toEqual(['Send', 'Save', 'Restart'])
    const steps: (() => void)[] = []
    update.mockImplementation(async (_bin, _base, report) => {
      for (const [step, fraction] of [['writing', 0.3], ['writing', 1], ['restarting'], ['done']] as const) { report?.(step, fraction); await new Promise<void>(resolve => steps.push(resolve)) }
    })
    const active = () => container.querySelector('.base-update-plan .is-active strong')?.textContent
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!)
    await vi.waitFor(() => expect(container.textContent).toContain('Sending the new base to your Octatrack'))
    expect(active()).toBe('Send'); expect(container.querySelector('progress')).not.toBeNull()
    await act(async () => steps.shift()!()); expect(active()).toBe('Save')
    expect(container.querySelector('[role="status"]')!.className).toBe('base-install-warning')
    await act(async () => steps.shift()!()); expect(active()).toBe('Restart')
    expect(container.querySelectorAll('.base-update-plan .is-complete')).toHaveLength(2)
    await act(async () => steps.shift()!()); await settle()
    expect(container.textContent).toContain('Done. Your Octatrack runs the new base.')
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
