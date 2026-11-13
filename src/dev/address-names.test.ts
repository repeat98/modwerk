// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addressNames, crashNames, keepSymbols, namesFor, withName } from './address-names'

describe('address names', () => {
  const names = addressNames({ 'core:tick': 0x40a00000, tick: 0x40a00000, frame: 0x40a00100, MAGIC: 0, REGISTER: 0xfc07c00c }, { '0x4005a2b8': 'popup' })

  it('names an address by the nearest symbol at or below it', () => {
    expect(names(0x40a00000)).toBe('tick')
    expect(names(0x40a000fe)).toBe('tick+0xfe')
    expect(names(0x40a00100)).toBe('frame')
    expect(names(0x4005a2c0)).toBe('popup+0x8')
  })

  it('names nothing far from a symbol, below the first or outside main memory', () => {
    expect(names(0x40a01100)).toBe('')
    expect(names(0x40000000)).toBe('')
    expect(names(0)).toBe('')
    expect(names(0xfc07c00c)).toBe('')
    expect(withName(names, 0x40a01100)).toBe('')
    expect(withName(undefined, 0x40a00000)).toBe('')
    expect(withName(names, 0x40a00004)).toBe(' (tick+0x4)')
    expect(crashNames(names, 0x40a00004, [0x12, 0x40a00110, 0x4005a2b8])).toBe('in tick+0x4, stack holds frame+0x10, popup')
    expect(crashNames(names, 0x12, [])).toBe('in nothing named')
    expect(crashNames(undefined, 0x40a00004, [])).toBe('')
  })

  it('finds a kept build by the start of its base identity, and no other base', () => {
    const build = mkdtempSync(join(tmpdir(), 'names-build-')), home = mkdtempSync(join(tmpdir(), 'names-home-'))
    writeFileSync(join(build, 'proofs.json'), JSON.stringify({ configurationHash: 'abcdef0123' }))
    writeFileSync(join(build, 'symbols.json'), JSON.stringify({ tick: 0x40a00000 }))
    keepSymbols(build, home)
    expect(namesFor('abcdef01', home)!(0x40a00002)).toBe('tick+0x2')
    expect(namesFor('12345678', home)).toBeUndefined()
    expect(namesFor('', home)).toBeUndefined()
    expect(namesFor('abcdef01', join(home, 'missing'))).toBeUndefined()
  })
})
