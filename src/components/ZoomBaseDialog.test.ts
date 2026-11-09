// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeZoomPedal } from '../dev/zoom-pedal-fake'
import { DEVICES_BY_ID } from '../devices/registry'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { ZoomBaseDialog } from './ZoomBaseDialog'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = () => {}
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!
const stage = () => container.querySelector('[data-stage-title]')?.textContent
const status = () => container.querySelector('.base-install-stage [role=status]')?.textContent
const until = (check: () => boolean) => vi.waitFor(() => { if (!check()) throw new Error('not yet') }, { timeout: 4000, interval: 20 })

describe('installing the base on an MS-70CDR', () => {
  it('goes from Zoom’s updater through update mode and the flash to the pedal answering with the base', async () => {
    const pedal = fakeZoomPedal(), link = new ZoomLink(() => Promise.resolve(pedal.access), 200)
    await link.connect()
    const main = Uint8Array.from({ length: 0xb0000 }, (_, i) => i & 0xff), stock = { 'Main.bin': new Uint8Array(1), 'Preset.bin': new Uint8Array(1) }
    const read = vi.fn(async () => stock), build = vi.fn(async () => ({ main })), onClose = vi.fn()
    await act(() => root.render(createElement(ZoomBaseDialog, { link, device: DEVICES_BY_ID['zoom-ms-70cdr'], onClose, read, build })))
    expect(container.querySelector('h2')?.textContent).toMatch(/^MIDISTOMP on your MS-70CDR/)
    await click(button('Show me how'))

    expect(stage()).toBe('Zoom’s updater')
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File(['zip'], 'MS-70CDR_v2.10_Mac_E.zip')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => /updater is ready/.test(container.textContent ?? ''))
    expect(button('Next').disabled).toBe(true)
    await act(() => { container.querySelector<HTMLInputElement>('.risk-accept input')!.click() })
    await click(button('Next'))

    expect(stage()).toBe('Put the pedal in update mode')
    expect(status()).toMatch(/running normally/)
    expect(button('Flash the base').disabled).toBe(true)
    await act(async () => { pedal.replug('1.10') })
    await until(() => /is in update mode/.test(status() ?? ''))
    await click(button('Flash the base'))

    await until(() => stage() === 'Start the pedal on the base')
    expect(build).toHaveBeenCalledWith(stock)
    expect(pedal.flash.subarray(0x040000, 0x0f0000)).toEqual(main)
    expect(button('Done').disabled).toBe(true)
    await act(async () => { pedal.replug('M201', 1) })   // still on its boot screen: the first identity request goes unanswered
    await until(() => /runs MIDISTOMP V2\.0\.1/.test(status() ?? ''))
    await click(button('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows where a flash stopped, and tries again while the pedal is still in update mode', async () => {
    const pedal = fakeZoomPedal({ firmware: '1.10', slow: { cmd: 0x02, nth: 3, ms: null } }), link = new ZoomLink(() => Promise.resolve(pedal.access), 100)
    await link.connect()
    const read = async () => ({ 'Main.bin': new Uint8Array(1), 'Preset.bin': new Uint8Array(1) }), build = async () => ({ main: new Uint8Array(0xb0000) })
    await act(() => root.render(createElement(ZoomBaseDialog, { link, device: DEVICES_BY_ID['zoom-ms-70cdr'], onClose: () => {}, read, build })))
    await click(button('Show me how'))
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File(['zip'], 'u.zip')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => /updater is ready/.test(container.textContent ?? ''))
    await act(() => { container.querySelector<HTMLInputElement>('.risk-accept input')!.click() })
    await click(button('Next'))
    await click(button('Flash the base'))
    await until(() => !!container.querySelector('.base-update-error'))
    expect(container.querySelector('.base-update-error')?.textContent).toMatch(/The flash stopped\..*bootloader is untouched/)
    expect(container.querySelector('.base-update-plan .is-failed strong')?.textContent).toBe('Write')
    expect(button('Try again').disabled).toBe(false)
    await click(button('Try again'))
    await until(() => stage() === 'Start the pedal on the base')
  })
})
