// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICES_BY_ID } from '../devices/registry'
import { pack7 } from '../engine/elektron/dn2-link'
import type { MidiAccessLike, MidiIn, MidiOut } from '../engine/elektron/os-upgrade-midi'
import { ModelCyclesUnit, RytmUnit } from './ModelCyclesUnit'

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

const put32 = (v: number) => [0, 1, 2, 3, 4].map(i => v >>> 7 * i & 0x7f)
// link.c's ident: version … boot status (0: none), boot image CRC, set CRC, set bytes
const IDENT = [1, 3, 0, 395, 2, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0xf2fe7324, 5764].flatMap(put32)
const MODS = pack7(Uint8Array.from([0, 0, 0xfe, 0x60, 0, 0, 0xfe, 0x60, 0, 0, 0, 0, 0, 0, 0, 1, 0x4d, 0x57, 0x49, 1,
  0xff, 0, 0, 1, 0x59, 0x4c, 0xfd, 0x26, ...[...'frames'.padEnd(16, '\0')].map(c => c.charCodeAt(0))]))
/** A Model:Cycles on USB answering the link's ident (0x01), load (0x23) and mods (0x33) with `answers`; a command
 * without an answer gets a bad-request refusal, as a base without it; `answers` null: no reply at all (stock). */
function unit(answers: Record<number, number[] | (() => number[])> | null, name = 'Elektron Model:Cycles'): MidiAccessLike {
  const input: MidiIn = { id: 'i', name, onmidimessage: null }
  const output: MidiOut = { id: 'o', name, send(data) {
    if (!answers) return
    const answer = answers[data[7]], body = typeof answer === 'function' ? answer() : answer
    queueMicrotask(() => input.onmidimessage?.({ data: Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, data[6], data[7] | 0x40, body ? 0 : 2, ...body ?? [], 0xf7]) }))
  } }
  return { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]) }
}
const render = (access: MidiAccessLike | null) => act(() => root.render(createElement(ModelCyclesUnit, { device: DEVICES_BY_ID['model-cycles'], request: access && (async () => access) })))
const connect = async () => { await act(() => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!.click() }) }
const settle = (ms = 30) => act(() => new Promise(resolve => setTimeout(resolve, ms)))
const text = () => container.textContent ?? ''

describe('the Model:Cycles page', () => {
  it('shows the base, its live modules and its load from a development base', async () => {
    let windows = 10
    await render(unit({ 0x01: IDENT, 0x33: [...MODS], 0x23: () => [738, 801, 849, windows++, 9000].flatMap(put32) }))
    expect(text()).toContain('Not connected')
    await connect(); await settle()
    expect(text()).toContain('Connected · Modwerk base · 1 module')
    expect(text()).toContain('Set f2fe7324 · 5764 bytes')
    expect(text()).toContain('frames')
    expect(text()).toContain('63.6 KB free')
    expect(text()).toContain('73.8%')
    expect(text()).toContain('84.9%')
  })
  it('says what a base without the loader or the load probe lacks', async () => {
    await render(unit({ 0x01: IDENT }))
    await connect(); await settle()
    expect(text()).toContain('Connected · Modwerk base')
    expect(text()).toContain('This base loads no modules over USB')
    expect(text()).toContain('doesn’t measure its load')
  })
  it('tells a unit without the link from no unit at all', async () => {
    await render(unit(null))
    await connect(); await settle(2200)
    expect(text()).toContain('Connected · no Modwerk base')
    expect(container.querySelector('a[href="#model-cycles/configuration"]')).not.toBeNull()
    await act(() => root.unmount()); root = createRoot(container)
    await render({ inputs: new Map(), outputs: new Map() })
    await connect(); await settle()
    expect(text()).toContain('No Model:Cycles over USB')
  }, 10000)
  it('needs a browser with MIDI', async () => {
    await render(null)
    expect(text()).toContain('can’t use MIDI')
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Connect')).toBe(false)
  })
})

// The Rytm's ident (link.c): eleven numbers, the label and OS build, then boot status, SRAM CRC, image CRC, the
// diagnostics' place (0 in a release base) and the set identity.
const RYTM_IDENT = [...[1, 0, 0, 0, 0, 0, 0, 3, 228, 32, 0].flatMap(put32), ...[...'FXCJ0176'].map(c => c.charCodeAt(0)),
  ...[0, 0, 0, 0, 0x5b81f884, 204316].flatMap(put32)]
const renderRytm = (access: MidiAccessLike | null) => act(() => root.render(createElement(RytmUnit, { device: DEVICES_BY_ID['analog-rytm-mkii'], request: access && (async () => access) })))
describe('the Analog Rytm MKII page', () => {
  it('shows a release base, its live modules and its load', async () => {
    let windows = 10
    await renderRytm(unit({ 0x01: RYTM_IDENT, 0x33: [...MODS], 0x23: () => [586, 656, 742, windows++, 9000].flatMap(put32) }, 'Elektron Analog Rytm MKII'))
    await connect(); await settle()
    expect(text()).toContain('Connected · Modwerk base · 1 module')
    expect(text()).toContain('Modwerk base · link 1 · FXCJ')
    expect(text()).toContain('Set 5b81f884 · 204316 bytes')
    expect(text()).toContain('58.6%')
    expect(text()).toContain('the voices, the sample playback and the FX')
  })
  it('finds no Rytm on a Model:Cycles port, nor an MKI', async () => {
    await renderRytm(unit({ 0x01: RYTM_IDENT }, 'Elektron Model:Cycles'))
    await connect(); await settle()
    expect(text()).toContain('No Analog Rytm over USB')
    await act(() => root.unmount()); root = createRoot(container)
    await renderRytm(unit({ 0x01: RYTM_IDENT }, 'Elektron Analog Rytm'))
    await connect(); await settle()
    expect(text()).toContain('No Analog Rytm over USB')
  })
})
