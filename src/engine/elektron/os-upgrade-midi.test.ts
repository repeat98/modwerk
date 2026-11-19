import { describe, expect, it } from 'vitest'
import { findUnit, midiLine, type MidiIn, type MidiOut } from './os-upgrade-midi'

const port = (id: string, name: string, state = 'connected') => ({ id, name, state })

describe('the Web MIDI line for an OS upgrade', () => {
  it('finds the one connected unit by its port name', () => {
    const input = { ...port('i', 'Elektron Digitone II'), onmidimessage: null } as MidiIn
    const output = { ...port('o', 'Elektron Digitone II'), send() {} } as MidiOut
    const other = { ...port('x', 'IAC Bus'), send() {} } as MidiOut
    expect(findUnit({ inputs: new Map([['i', input]]), outputs: new Map([['o', output], ['x', other]]) }, 'digitone ii')).toEqual({ input, output })
    expect(findUnit({ inputs: new Map(), outputs: new Map([['o', output]]) }, 'Digitone II')).toBeNull()
  })

  it('sends bytes as they are and hands back whole SysEx messages, joined across events, in order', async () => {
    const sent: number[][] = [], input = { ...port('i', 'u'), onmidimessage: null } as MidiIn
    const line = midiLine(input, { ...port('o', 'u'), send: (d: number[]) => { sent.push(d) } } as MidiOut)
    line.send(Uint8Array.of(0xf0, 1, 0xf7))
    expect(sent).toEqual([[0xf0, 1, 0xf7]])
    const waiting = line.next(1000)
    input.onmidimessage!({ data: Uint8Array.of(0xf0, 1, 2) })
    input.onmidimessage!({ data: Uint8Array.of(0xf8, 3, 0xf7, 0x90, 60, 100, 0xf0, 9, 0xf7) })
    expect(await waiting).toEqual(Uint8Array.of(0xf0, 1, 2, 3, 0xf7))
    expect(await line.next(10)).toEqual(Uint8Array.of(0xf0, 9, 0xf7))
    expect(await line.next(10)).toBeNull()
    line.close()
    expect(input.onmidimessage).toBeNull()
  })
})
