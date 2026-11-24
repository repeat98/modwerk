// @vitest-environment jsdom
// The page's USB install in a browser: a send waits for the MIDI permission; choosing another build or leaving the
// page meanwhile must send nothing of the old build, and the MIDI listener must be given back.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HEADER, unpack7, upgradeMessages } from '../engine/elektron/os-upgrade'
import { encode8in7 } from '../engine/elektron/codec/transport'
import type { MidiAccessLike, MidiIn, MidiOut } from '../engine/elektron/os-upgrade-midi'
import { UsbUpgradePanel } from './UsbUpgradePanel'

const build = (seed: number, length: number) => ({ syx: Uint8Array.from({ length }, (_, i) => i * seed + 1 & 0xff), sha256: String(seed).repeat(64).slice(0, 64) })
const A = build(13, 5000), B = build(7, 3000), C = build(5, 200000)

/** A Digitone II that answers like the stock OS, and remembers the size each upload's start message names. */
function unit(later = false) {
  const sent: number[][] = [], starts: number[] = []
  let count = 0, last = 0
  const input: MidiIn = { id: 'in', name: 'Elektron Digitone II', state: 'connected', onmidimessage: null }
  const output: MidiOut = { id: 'out', name: 'Elektron Digitone II', state: 'connected', send(data: number[]) {
    sent.push(data)
    const d = unpack7(Uint8Array.from(data).subarray(HEADER.length, -1))
    const first = d[4] === 0x50
    if (first) { count = 0; starts.push(d[5] | d[6] << 8 | d[7] << 16 | d[8] << 24); last = 0 }
    const i = count++
    const done = !first && i === last
    const body = first ? [d[0], d[1], d[0], d[1], 0xd0, 0, 0] : [d[0], d[1], d[0], d[1], 0xd1, 0, 0, 0, 0, done ? 1 : 0, 0]
    const answer = () => input.onmidimessage?.({ data: Uint8Array.from([...HEADER, ...encode8in7(Uint8Array.from(body)), 0xf7]) })
    if (later) setTimeout(answer, 1); else queueMicrotask(answer)   // later: a unit that takes its time per block
  } }
  const access: MidiAccessLike = { inputs: new Map([['in', input]]), outputs: new Map([['out', output]]) }
  return { access, input, sent, starts, expect: (syx: Uint8Array) => { last = upgradeMessages(syx).length - 1 } }
}

/** The browser's permission prompt: open until the test grants it. */
function prompt(access: MidiAccessLike) {
  let grant = () => {}, asked = 0
  const midi = () => { asked++; return new Promise<MidiAccessLike>(resolve => { grant = () => resolve(access) }) }
  return { midi, grant: () => grant(), asked: () => asked }
}

let root: Root, host: HTMLDivElement
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve() }) }
const panel = (b: typeof A, midi: () => Promise<MidiAccessLike>) =>
  createElement(UsbUpgradePanel, { machine: 'digitone-ii', name: 'Digitone II', syx: b.syx, sha256: b.sha256, version: 'MW01', riskAccepted: true, midi })
async function show(b: typeof A, midi: () => Promise<MidiAccessLike>) { await act(async () => { root.render(panel(b, midi)) }) }
async function press() {
  const box = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
  if (!box.checked) await act(async () => { box.click() })
  const button = [...host.querySelectorAll('button')].find(b => /Send/.test(b.textContent ?? ''))!
  expect(button.disabled).toBe(false)
  await act(async () => { button.click() })
}

beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('the USB install while the MIDI permission is pending', () => {
  it('sends nothing of the old build when another build is chosen, and the new build goes out on its own send', async () => {
    const u = unit(), p = prompt(u.access)
    await show(A, p.midi)
    await press()
    expect(host.textContent).toContain('Looking for the Digitone II')
    await show(B, p.midi)                               // another build while the browser still asks
    p.grant()
    await flush()
    expect(u.sent).toEqual([])                          // zero sends for the old build
    expect(u.input.onmidimessage).toBeNull()
    expect(host.textContent).not.toContain('Looking for the Digitone II')

    u.expect(B.syx)
    await press()
    p.grant()
    await flush()
    expect(u.starts).toEqual([B.syx.length])            // only the build on the page now
    expect(host.textContent).toContain('UPGRADE OS NOW?')
    expect(u.input.onmidimessage).toBeNull()
  })

  it('A, then B while the permission is pending, then A again: A shows idle and sends again, B sent nothing', async () => {
    const u = unit(), p = prompt(u.access)
    await show(A, p.midi)
    await press()
    expect(host.textContent).toContain('Looking for the Digitone II')
    await show(B, p.midi)                               // B chosen, nothing sent for it
    p.grant()                                           // the cancelled request finishes
    await flush()
    await show(A, p.midi)                               // back to A
    expect(host.textContent).not.toContain('Looking for the Digitone II')
    expect(u.sent).toEqual([])
    expect(p.asked()).toBe(1)                           // no send started for B

    u.expect(A.syx)
    await press()                                       // Send is enabled again for A
    p.grant()
    await flush()
    expect(u.starts).toEqual([A.syx.length])
    expect(host.textContent).toContain('UPGRADE OS NOW?')
    expect(u.input.onmidimessage).toBeNull()
  })

  it('back to A before the cancelled request has finished: A still shows idle, and its old answer sends nothing', async () => {
    const u = unit(), p = prompt(u.access)
    await show(A, p.midi)
    await press()
    await show(B, p.midi)
    await show(A, p.midi)                               // the old prompt is still open
    expect(host.textContent).not.toContain('Looking for the Digitone II')
    p.grant()
    await flush()
    expect(u.sent).toEqual([])
    expect(host.textContent).not.toContain('Looking for the Digitone II')
  })

  it('sends nothing when the page is left, and a panel mounted later can send', async () => {
    const u = unit(), p = prompt(u.access)
    await show(A, p.midi)
    await press()
    await act(async () => root.unmount())
    p.grant()
    await flush()
    expect(u.sent).toEqual([])
    expect(u.input.onmidimessage).toBeNull()

    root = createRoot(host)
    u.expect(A.syx)
    await show(A, p.midi)
    await press()
    p.grant()
    await flush()
    expect(u.starts).toEqual([A.syx.length])
  })

  it('a send from a new panel waits for the old run to end, then sends its own build only', async () => {
    const u = unit(), p = prompt(u.access)
    await show(A, p.midi)
    await press()
    await act(async () => root.unmount())
    root = createRoot(host)
    u.expect(B.syx)
    await show(B, p.midi)
    await press()                                       // the old prompt is still open
    expect(host.textContent).toContain('Looking for the Digitone II')
    p.grant()                                           // answers the old request: it is cancelled
    await flush()
    expect(u.sent).toEqual([])
    p.grant()                                           // the new run's own request
    await flush()
    expect(u.starts).toEqual([B.syx.length])
  })

  it('stops a transfer under way when the build changes, before the unit has it all', async () => {
    const u = unit(true), p = prompt(u.access)
    u.expect(C.syx)
    await show(C, p.midi)
    await press()
    p.grant()
    await act(async () => { await new Promise(done => setTimeout(done, 15)) })   // a few blocks out
    await show(B, p.midi)
    const atChange = u.sent.length
    await act(async () => { await new Promise(done => setTimeout(done, 30)) })
    expect(u.sent.length).toBe(atChange)                // nothing after the change
    const total = upgradeMessages(C.syx).length
    expect(u.sent.length).toBeGreaterThan(0)
    expect(u.sent.length).toBeLessThan(total)
    expect(u.input.onmidimessage).toBeNull()
    expect(host.textContent).not.toContain('UPGRADE OS NOW? press')
  })
})
