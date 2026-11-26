// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encode8in7 } from '../engine/elektron/codec/transport'
import { HEADER, unpack7 } from '../engine/elektron/os-upgrade'
import type { MidiAccessLike, MidiIn, MidiOut } from '../engine/elektron/os-upgrade-midi'
import { ElektronSendDialog } from './ElektronSendDialog'

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
const until = (check: () => boolean) => vi.waitFor(() => { if (!check()) throw new Error('not yet') }, { timeout: 4000, interval: 20 })

/** A Model:Cycles that takes the upgrade like the stock OS: status `start` for the start, done on the last block. */
function cycles(blocks: number, start = 0): MidiAccessLike {
  const input: MidiIn = { id: 'i', name: 'Elektron Model:Cycles', onmidimessage: null }
  let sent = 0
  const output: MidiOut = { id: 'o', name: 'Elektron Model:Cycles', send(data) {
    const d = unpack7(Uint8Array.from(data).subarray(HEADER.length, -1)), i = sent++
    const body = i === 0 ? [d[0], d[1], d[0], d[1], 0xd0, start, 0] : [d[0], d[1], d[0], d[1], 0xd1, 0, 0, 0, 0, i === blocks ? 1 : 0, 0]
    queueMicrotask(() => input.onmidimessage?.({ data: Uint8Array.from([...HEADER, ...encode8in7(Uint8Array.from(body)), 0xf7]) }))
  } }
  return { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]) }
}
const file = { name: 'Modwerk-model-cycles-test.syx', data: new Uint8Array(5000).buffer }

describe('sending a build to a Model:Cycles from the page', () => {
  it('sends the build and then tells the person to press YES on the unit', async () => {
    const onClose = vi.fn()
    await act(() => root.render(createElement(ElektronSendDialog, { name: 'Model:Cycles', model: 'Model:Cycles', file, recovery: 'Hold FUNC…', onClose, request: async () => cycles(3) })))
    expect(container.querySelector('h2')?.textContent).toMatch(/^Send to your Model:Cycles/)
    await click(button('Send to your Model:Cycles'))
    await until(() => /press YES to install it/.test(container.textContent ?? ''))
    await click(button('Done'))
    expect(onClose).toHaveBeenCalled()
  })
  it('says why it stopped, and offers to try again', async () => {
    await act(() => root.render(createElement(ElektronSendDialog, { name: 'Model:Cycles', model: 'Model:Cycles', file, onClose: () => {}, request: async () => cycles(3, 3) })))
    await click(button('Send to your Model:Cycles'))
    await until(() => /Sending stopped/.test(container.textContent ?? ''))
    expect(container.textContent).toMatch(/refused the upgrade/)
    expect(button('Try again').disabled).toBe(false)
  })
  it('explains when the browser has no MIDI', async () => {
    await act(() => root.render(createElement(ElektronSendDialog, { name: 'Model:Cycles', model: 'Model:Cycles', file, onClose: () => {}, request: null })))
    expect(container.textContent).toMatch(/can’t use MIDI/)
    expect(button('Send to your Model:Cycles').disabled).toBe(true)
  })
})
