// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
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
  async function older(updatesBase: boolean) {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    unit.base = 'cc'.repeat(32); unit.updatesBase = updatesBase
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const expected = 'ab'.repeat(32), bin = new Uint8Array([1, 2, 3, 4])
    const update = vi.spyOn(link, 'updateBase').mockImplementation(async (_bin, _base, report) => { report?.('staging', 0.5); report?.('done') })
    const onReady = vi.fn(), buildBase = vi.fn(async () => ({ buffer: bin.buffer, sha256: 'x', base: expected }))
    await act(() => root.render(createElement(BaseInstallDialog, { link, firmwareReady: true, onChooseFirmware: () => {}, buildBase, onClose: () => {}, onReady })))
    return { link, update, onReady, expected, bin }
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
    expect(onReady).toHaveBeenCalledTimes(1)
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
    expect(container.textContent).toContain('USB Audio · Main over USB')
    expect(buttonNamed('Download base .bin')).toBeUndefined()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(buildBase).toHaveBeenCalledWith('main')
    expect(update.mock.calls[0][1]).toBe(expected)
  })
})
