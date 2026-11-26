import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HEADER, unpack7, upgradeMessages } from '../engine/elektron/os-upgrade'
import { encode8in7 as pack7 } from '../engine/elektron/codec/transport'
import type { MidiAccessLike, MidiIn, MidiOut } from '../engine/elektron/os-upgrade-midi'
import { runUsbUpgrade, type UsbUpgradeState } from './useUsbUpgrade'
import { UsbUpgradePanel } from '../components/UsbUpgradePanel'
import { DIGI_DOWNLOADS_ENABLED, USB_UPGRADE_ENABLED, USB_UPGRADE_MACHINES, usbUpgradeEnabled } from '../engine/elekloader/protocol'

const syx = Uint8Array.from({ length: 5000 }, (_, i) => i * 13 + 1 & 0xff)

/** Web MIDI ports of a unit named `name` that answers each upgrade message as the stock OS does, with `status(i)`
 * (null: no answer). The answer arrives on the input's onmidimessage, as the browser delivers it. */
function midiUnit(name: string, status: (i: number) => number | null = i => i === upgradeMessages(syx).length - 1 ? 1 : 0) {
  let sent = 0
  const input: MidiIn = { id: 'in', name, state: 'connected', onmidimessage: null }
  const output: MidiOut = { id: 'out', name, state: 'connected', send(data: number[]) {
    const d = unpack7(Uint8Array.from(data).subarray(HEADER.length, -1)), i = sent++, s = status(i)
    if (s === null) return
    const body = i === 0 ? [d[0], d[1], d[0], d[1], 0xd0, s, 0] : [d[0], d[1], d[0], d[1], 0xd1, 0, 0, 0, 0, s, 0]
    const reply = Uint8Array.from([...HEADER, ...pack7(Uint8Array.from(body)), 0xf7])
    queueMicrotask(() => input.onmidimessage?.({ data: reply }))
  } }
  const access: MidiAccessLike = { inputs: new Map([['in', input]]), outputs: new Map([['out', output]]) }
  return { access, input, sent: () => sent }
}

async function run(access: MidiAccessLike | Error, name = 'Digitone II') {
  const states: UsbUpgradeState[] = []
  await runUsbUpgrade(async () => { if (access instanceof Error) throw access; return access }, name, syx, state => states.push(state), () => 0)
  return states
}

describe('installing a build over USB from the page', () => {
  it('is offered only once the owner turns it on, apart from downloads', () => {
    expect(USB_UPGRADE_MACHINES).toContain('digitone-ii')                  // the page can install it
    expect(Object.values(USB_UPGRADE_ENABLED).some(Boolean)).toBe(false)  // but offers it nowhere yet
    expect(usbUpgradeEnabled('digitone-ii')).toBe(false)
    expect(DIGI_DOWNLOADS_ENABLED['digitone-ii']).toBe(false)
    expect(usbUpgradeEnabled('octatrack')).toBe(false)
    expect(usbUpgradeEnabled('hasOwnProperty')).toBe(false)
  })

  it('sends every block to the named unit, reports its progress, and ends asking for YES on the unit', async () => {
    const unit = midiUnit('Elektron Digitone II'), total = upgradeMessages(syx).length
    const states = await run(unit.access)
    expect(states[0]).toEqual({ phase: 'connecting' })
    expect(states.filter(s => s.phase === 'sending').map(s => s.phase === 'sending' && s.sent)).toEqual(Array.from({ length: total }, (_, i) => i + 1))
    expect(states.at(-1)).toEqual({ phase: 'confirm', seconds: 0 })
    expect(unit.sent()).toBe(total)
    expect(unit.input.onmidimessage).toBeNull()            // the input is given back
  })

  it('stops before anything is written when the unit is missing, refuses, or MIDI is not allowed', async () => {
    expect((await run(midiUnit('IAC Bus').access)).at(-1)).toMatchObject({ phase: 'failed', error: expect.stringContaining('No Digitone II found') })
    const refused = midiUnit('Digitone II', i => i === 0 ? 3 : 0)
    expect((await run(refused.access)).at(-1)).toMatchObject({ phase: 'failed', error: expect.stringContaining('refused the upgrade') })
    expect(refused.sent()).toBe(1)
    expect((await run(new Error('denied'))).at(-1)).toMatchObject({ phase: 'failed', error: expect.stringContaining('denied') })
  })

  it('offers the send only after both the risk and the recovery steps are acknowledged', () => {
    const html = (riskAccepted: boolean) => renderToStaticMarkup(createElement(UsbUpgradePanel, { machine: 'digitone-ii', name: 'Digitone II', syx, sha256: 'ab', version: 'MW01', riskAccepted }))
    expect(html(false)).toMatch(/<button[^>]*disabled=""[^>]*>.*Send MW01 to the Digitone II/)
    expect(html(true)).toMatch(/<button[^>]*disabled=""[^>]*>.*Send MW01 to the Digitone II/)   // recovery not ticked yet
    expect(html(true)).toContain('UPGRADE OS NOW?')
  })
})
