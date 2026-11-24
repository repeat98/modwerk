// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { assembleSharc, sharcProgramCounter } from './sharc-asm.ts'

// Each statement alone at 0x200d0000; the expected parcels are the instruction types of the SHARC+ programming reference.
const one = (statement: string) => {
  const { blocks } = assembleSharc(`.code 0x200d0000\nhere: ${statement}`)
  const bytes = blocks[0].bytes
  const text = Array.from({ length: bytes.length / 2 }, (_, k) => (bytes[2 * k] | bytes[2 * k + 1] << 8).toString(16).padStart(4, '0')).join('')
  expect(bytes.length % 4).toBe(0)
  return text
}
// The loader places whole 32-bit words: a block ending inside one is padded with a zero parcel.
const padded = (parcels: string) => parcels + '0'.repeat(-parcels.length & 7)

describe('SHARC assembler', () => {
  it.each([
    ['R0 = 0x1234', '0f0000001234'],
    ['F12 = 0.5', '0f0c3f000000'],
    ['R4 = DM(0x8035040)', '100408035040'],
    ['DM(0x8035041) = R4', '110408035041'],
    ['I0 = R4', '707e083f'],
    ['M0 = R0', '703e103f'],
    ['I0 = R1', '703e883f'],
    ['CALL 0xbe8000', '06be00be8000'],
    ['IF EQ CALL 0xbe8000', '068000be8000'],
    ['RTS', '0a3e00000000'],
    // Type 11a with bit 39 clear: the old 0aa0... (type 11c) hung the unit when NE was false.
    ['IF NE RTS', '0a2000000000'],
    ['IF NE R1 = R2', '702100bf'],
    ['R0 = DM(I0, M0)', '503e00000000'],
    ['R0 = DM(M0, I0)', '403e00000000'],
    ['DM(I1, M0) = R0', '523e80000000'],
    ['F0 = F1 + F2, DM(I2, M1) = R5', '547e82881012'],
    ['F3 = F4 * F5, R1 = DM(I4, M4)', '593e00930345'],
    ['DM(I7, M7) = 0x1234', '9fc000001234'],
    ['R3 = R4 + R5', '013e00001345'],
    ['R3 = R4 - R5', '013e00002345'],
    ['R3 = R4 XOR R5', '013e00042345'],
    ['R3 = PASS R4', '013e00021340'],
    ['R3 = R4 + 1', '013e00029340'],
    ['R3 = MIN(R4, R5)', '013e00061345'],
    ['COMP(R4, R5)', '013e0000a045'],
    ['R3 = R4 * R5 (SSI)', '013e00170345'],
    ['R3 = LSHIFT R4 BY R5', '013e00200345'],
    ['F3 = F4 * F5', '013e00130345'],
    ['F3 = MAX(F4, F5)', '013e000e2345'],
    ['F3 = FLOAT R4', '013e000ca340'],
    ['R3 = FIX F4', '013e000c9340'],
    ['F3 = RECIPS F4', '013e000c4340'],
    ['F3 = RSQRTS F4', '013e000c5340'],
    ['IF EQ F0 = F1 + F2', '010000081012'],
    ['IF NOT SV JUMP here', '062e00be8000'],
    ['NOP', '000000000000'],
  ])('%s', (statement, parcels) => expect(one(statement)).toBe(padded(parcels)))

  it('makes a linked call as the stock render loop does, pushing the return address minus one', () => {
    expect(one('CCALL 0x1c4ecf')).toBe(padded('1804001c4ecf' + '5ffe81000000' + '9fc000be8008'))
  })

  it('returns as the stock player does', () => {
    expect(one('CRET')).toBe(padded('4dfe0e000000' + '000000000000' + '083f343f' + '000000000000' + '1901'))
  })

  it('places code and data, with labels as program counters and byte addresses', () => {
    const { blocks, symbols } = assembleSharc(`.code 0x200d0000\nstart: NOP\nnext: JUMP start\n.data 0x200d8000\ntable: .word 1, table\n.float -1.0`)
    expect(symbols.get('start')).toBe(sharcProgramCounter(0x200d0000))
    expect(symbols.get('next')).toBe(0xbe8003)
    expect(blocks.map(block => block.address)).toEqual([0x200d0000, 0x200d8000])
    expect(blocks.map(block => block.code)).toEqual([true, false])
    expect(Array.from(blocks[1].bytes)).toEqual([1, 0, 0, 0, 0x00, 0x80, 0x0d, 0x20, 0, 0, 0x80, 0xbf])
  })

  it('keeps code and data that touch in separate blocks, so a package can say which is code', () => {
    const { blocks } = assembleSharc(`.code 0x200d0000\nNOP\nNOP\n.data 0x200d000c\n.word 7`)
    expect(blocks.map(block => [block.address, block.bytes.length, block.code])).toEqual([[0x200d0000, 12, true], [0x200d000c, 4, false]])
  })

  it('encodes a loop with its end relative to DO', () => {
    expect(one('LCNTR = 32, DO end UNTIL LCE\nR0 = DM(I0, M0)\nNOP\nend: DM(I1, M0) = R0').slice(0, 12)).toBe('0c0020800009')
  })

  it('refuses a short instruction among the last 11 of a hardware loop', () => {
    expect(() => assembleSharc('.code 0x200d0000\nLCNTR = 4, DO end UNTIL LCE\nI0 = R4\nNOP\nend: NOP'))
      .toThrow(/line 3: a 16- or 32-bit instruction among the last 11/)
    expect(() => assembleSharc(`.code 0x200d0000\nLCNTR = 4, DO end UNTIL LCE\nI0 = R4\n${'NOP\n'.repeat(10)}end: NOP`)).not.toThrow()
  })

  it('refuses storing a DAG register through an index register of the same DAG', () => {
    expect(() => assembleSharc('.code 0x200d0000\nDM(I1, M0) = I2')).toThrow(/line 2: a DAG register stored/)
    expect(() => assembleSharc('.code 0x200d0000\nDM(I1, M0) = M3')).toThrow(/same DAG/)
    expect(() => assembleSharc('.code 0x200d0000\nDM(I1, M0) = I12')).not.toThrow()
  })

  it('names the line of an error', () => {
    expect(() => assembleSharc('.code 0x200d0000\nNOP\nR0 = FOO(R1)')).toThrow(/line 3: .*unknown symbol FOO|line 3/)
    expect(() => assembleSharc('NOP')).toThrow(/line 1: instruction outside a \.code block/)
    expect(() => assembleSharc('.code 0x1000')).toThrow(/L2 loader byte address/)
    expect(() => assembleSharc('.code 0x200d0000\na: NOP\na: NOP')).toThrow(/label defined twice/)
  })

  it('refuses overlapping blocks', () => {
    expect(() => assembleSharc('.code 0x200d0000\nNOP\n.data 0x200d0000\n.word 1')).toThrow(/overlapping/)
  })
})
