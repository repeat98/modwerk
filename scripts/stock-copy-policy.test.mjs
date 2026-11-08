// SPDX-License-Identifier: Elastic-2.0
import { describe, expect, it } from 'vitest'
import { checkRequestedStockCopies } from './stock-copy-policy.mjs'

const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64)
const copy = (source, bytes, sha256, offset = 0) => ({ section: 1, offset, source, bytes, sha256 })
const replay = (n = 4) => Array.from({ length: n }, (_, i) => copy(0x40001000 + 16 * i, 6, A, 8 * i))
const detours = { detours: [0, 1, 2, 3].map(i => ({ address: 0x40001000 + 16 * i, guardLength: 6, guardSha256: A })) }

describe('stock copies a requested card package may carry', () => {
  it('accepts a package without copies', () => {
    expect(() => checkRequestedStockCopies({ label: 'unit', stockCopies: [] }, { detours: [] })).not.toThrow()
  })
  it('accepts the four replay spans of a replaying package that match its detour guards', () => {
    expect(() => checkRequestedStockCopies({ label: 'polyui', stockCopies: replay() }, detours)).not.toThrow()
  })
  it('refuses a replaying package without exactly four copies', () => {
    expect(() => checkRequestedStockCopies({ label: 'vector', stockCopies: replay(3) }, detours)).toThrow('Invalid inherited stock placeholder inventory')
  })
  it("accepts VECTOR's fifth replay span (its MIDI generator list on a card) and no other package's", () => {
    const five = { detours: [0, 1, 2, 3, 4].map(i => ({ address: 0x40001000 + 16 * i, guardLength: 6, guardSha256: A })) }
    expect(() => checkRequestedStockCopies({ label: 'vector', stockCopies: replay(5) }, five)).not.toThrow()
    expect(() => checkRequestedStockCopies({ label: 'vector', stockCopies: replay(4) }, five)).toThrow('Invalid inherited stock placeholder inventory')
    expect(() => checkRequestedStockCopies({ label: 'polyui', stockCopies: replay(5) }, five)).toThrow('Invalid inherited stock placeholder inventory')
  })
  it('refuses a replay span that differs from its detour guard', () => {
    const copies = replay(); copies[2] = copy(copies[2].source, 6, B, 16)
    expect(() => checkRequestedStockCopies({ label: 'polyui', stockCopies: copies }, detours)).toThrow('Inherited replay span must match its declared native detour guard')
  })
  it('keeps the 23-byte USB descriptor rule', () => {
    expect(() => checkRequestedStockCopies({ label: 'usbmidi_cfg', stockCopies: replay() }, detours)).toThrow('Invalid inherited USB descriptor length')
    expect(() => checkRequestedStockCopies({ label: 'usbmidi_cfg', stockCopies: [0, 1, 2, 3].map(i => copy(0x40002000 + 32 * i, 23, C, 24 * i)) }, { detours: [] })).not.toThrow()
  })
  it('accepts a data copy its import record declares', () => {
    const guards = [{ kind: 'guarded-local-cpu-read', address: 0x400ea18a, bytes: 32, sha256: C }, { kind: 'guarded-local-cpu-read', address: 0x400ea1aa, bytes: 6, sha256: A }]
    const pkg = { label: 'stems', stockCopies: [copy(0x400ea18a, 32, C), copy(0x400ea1aa, 6, A, 32)] }
    expect(() => checkRequestedStockCopies(pkg, { detours: [] }, guards)).not.toThrow()
  })
  it('refuses a data copy no import record declares', () => {
    const pkg = { label: 'stems', stockCopies: [copy(0x400ea18a, 32, C)] }
    expect(() => checkRequestedStockCopies(pkg, { detours: [] }, [])).toThrow('A stock data copy must match a guard its import record declares')
  })
  it('refuses a declared data copy whose length or fingerprint differs', () => {
    const guards = [{ kind: 'guarded-local-cpu-read', address: 0x400ea18a, bytes: 32, sha256: C }]
    expect(() => checkRequestedStockCopies({ label: 'stems', stockCopies: [copy(0x400ea18a, 32, B)] }, { detours: [] }, guards)).toThrow('A stock data copy must match a guard its import record declares')
    expect(() => checkRequestedStockCopies({ label: 'stems', stockCopies: [copy(0x400ea18a, 31, C)] }, { detours: [] }, guards)).toThrow('A stock data copy must match a guard its import record declares')
  })
  it('refuses a guard of another kind as a data copy', () => {
    const guards = [{ kind: 'guarded-local-dsp-read', address: 0x400ea18a, bytes: 32, sha256: C }]
    expect(() => checkRequestedStockCopies({ label: 'stems', stockCopies: [copy(0x400ea18a, 32, C)] }, { detours: [] }, guards)).toThrow('A stock data copy must match a guard its import record declares')
  })
})
