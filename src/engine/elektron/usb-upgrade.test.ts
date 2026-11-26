import { describe, expect, it } from 'vitest'
import { encode8in7 } from './codec/transport'
import { HEADER, unpack7 } from './os-upgrade'
import type { MidiAccessLike, MidiIn, MidiOut } from './os-upgrade-midi'
import { sendOverUsb, usbUpgradePort } from './usb-upgrade'

/** MIDI ports of a unit that answers the upgrade like the stock OS: `last` says done on the final block. */
function unitPorts(name: string, refuseStart = false) {
  const input: MidiIn = { id: 'i', name, onmidimessage: null }
  let sent = 0
  const output: MidiOut = { id: 'o', name, send(data) {
    const bytes = Uint8Array.from(data), d = unpack7(bytes.subarray(HEADER.length, -1)), i = sent++
    const done = d[4] === 0x51 && (d[13] << 24 | d[14] << 16 | d[15] << 8 | d[16]) + (d[9] << 24 | d[10] << 16 | d[11] << 8 | d[12]) >= total
    const body = i === 0 ? [d[0], d[1], d[0], d[1], 0xd0, refuseStart ? 3 : 0, 0] : [d[0], d[1], d[0], d[1], 0xd1, 0, 0, 0, 0, done ? 1 : 0, 0]
    queueMicrotask(() => input.onmidimessage?.({ data: Uint8Array.from([...HEADER, ...encode8in7(Uint8Array.from(body)), 0xf7]) }))
  } }
  let total = 0
  const access: MidiAccessLike = { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]) }
  return { access, input, sentCount: () => sent, setTotal: (n: number) => { total = n } }
}

describe('sending a build to the unit over USB', () => {
  it('lists only machines whose upgrade over USB ran on a unit', () => {
    expect(usbUpgradePort('model-cycles')).toBe('Model:Cycles')
    expect(usbUpgradePort('digitakt')).toBeUndefined()
    expect(usbUpgradePort('toString')).toBeUndefined()
  })
  it('sends every block to the Model:Cycles and reports progress until the unit has the file', async () => {
    const syx = Uint8Array.from({ length: 5000 }, (_, i) => i & 0x7f), unit = unitPorts('Elektron Model:Cycles')
    unit.setTotal(syx.length)
    const progress: number[] = []
    await sendOverUsb(async () => unit.access, 'Model:Cycles', syx, p => progress.push(p.sent))
    expect(unit.sentCount()).toBe(4)          // the start and three 2 KiB blocks
    expect(progress).toEqual([1, 2, 3, 4])
    expect(unit.input.onmidimessage).toBeNull() // the input is given back
  })
  it('stops with the unit on its OS when it refuses, and when no Model:Cycles is connected', async () => {
    const refusing = unitPorts('Elektron Model:Cycles', true)
    await expect(sendOverUsb(async () => refusing.access, 'Model:Cycles', new Uint8Array(10))).rejects.toThrow(/refused the upgrade/)
    expect(refusing.input.onmidimessage).toBeNull()
    const other = unitPorts('Elektron Digitakt')
    await expect(sendOverUsb(async () => other.access, 'Model:Cycles', new Uint8Array(10))).rejects.toThrow(/No Model:Cycles found/)
  })
})
