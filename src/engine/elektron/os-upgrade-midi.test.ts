import { describe, expect, it } from 'vitest'
import { findUnit, midiLine, namesModel, type MidiIn, type MidiOut } from './os-upgrade-midi'

const port = (id: string, name: string, state = 'connected') => ({ id, name, state })

describe('the Web MIDI line for an OS upgrade', () => {
  it('finds the one connected unit by its port name', () => {
    const input = { ...port('i', 'Elektron Digitone II'), onmidimessage: null } as MidiIn
    const output = { ...port('o', 'Elektron Digitone II'), send() {} } as MidiOut
    const other = { ...port('x', 'IAC Bus'), send() {} } as MidiOut
    expect(findUnit({ inputs: new Map([['i', input]]), outputs: new Map([['o', output], ['x', other]]) }, 'digitone ii')).toEqual({ input, output })
    expect(findUnit({ inputs: new Map(), outputs: new Map([['o', output]]) }, 'Digitone II')).toBeNull()
  })

  it('tells the Digitone from the Digitone II, alone and connected together, whatever the system adds around the name', () => {
    const pair = (id: string, name: string) => ({
      input: { ...port(id + 'i', name), onmidimessage: null } as MidiIn,
      output: { ...port(id + 'o', name), send() {} } as MidiOut,
    })
    const access = (...pairs: ReturnType<typeof pair>[]) => ({
      inputs: new Map(pairs.map(p => [p.input.id, p.input] as [string, MidiIn])),
      outputs: new Map(pairs.map(p => [p.output.id, p.output] as [string, MidiOut])),
    })
    const one = pair('1', 'Elektron Digitone'), two = pair('2', 'Elektron Digitone II')
    expect(findUnit(access(two), 'Digitone')).toBeNull()
    expect(findUnit(access(two), 'Digitone II')).toEqual(two)
    expect(findUnit(access(one), 'Digitone')).toEqual(one)
    expect(findUnit(access(one), 'Digitone II')).toBeNull()
    expect(findUnit(access(one, two), 'Digitone')).toEqual(one)
    expect(findUnit(access(one, two), 'Digitone II')).toEqual(two)
    for (const name of ['Digitone II', 'Elektron Digitone II', 'Digitone II MIDI 1', '2- Elektron Digitone II', 'DIGITONE II'])
      expect(namesModel(name, 'Digitone II')).toBe(true)
    for (const name of ['Digitone II', 'Digitone MKII', 'Digitone Keys', 'Digitones', 'Elektron Digitone II MIDI 1'])
      expect(namesModel(name, 'Digitone')).toBe(false)
    for (const name of ['Digitone', 'Elektron Digitone', 'Digitone MIDI 1', '2- Elektron Digitone'])
      expect(namesModel(name, 'Digitone')).toBe(true)
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
