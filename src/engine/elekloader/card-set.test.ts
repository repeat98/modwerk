import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cardSetGeneration, encodeCardSet } from './card-set'
import { prepareCardSet } from './module-set'
import { SAVED_SET_CAPACITY } from './upload-wire'
import { layoutIdentity } from './base-variants'
import manifest from '../assets/octatrack-module-packages.json' with { type: 'json' }

// test_modset.c's packages (its `make`): MWRM, ABI 4, an image, the module's runtime id.
const pkg = (id: number, length = 48) => {
  const data = new Uint8Array(length), view = new DataView(data.buffer)
  view.setUint32(0, 0x4d57524d); view.setUint16(4, 4); view.setUint32(8, 4); view.setUint32(28, id)
  return data
}
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex')
// The base of the C host tests (test_modset.c modwerk_base_digest) and the file the base's own code is run against.
const HOST_BASE = '010203' + '00'.repeat(29), FIXTURE = new URL('../../../sdk/tests/card-set-fixture.hex', import.meta.url)
const fixture = () => encodeCardSet(HOST_BASE, [pkg(0x873d83cc), pkg(0x3cbedc9c, 41)], 1700000000)

describe('the module set file for the card', () => {
  it('is the base’s MWST v1: header, base identity, SHA-256 of the packages, each padded to 4, in whole sectors', () => {
    const file = fixture(), view = new DataView(file.buffer), used = 84 + 8 + 48 + 8 + 44
    expect(hex(file.subarray(0, 4))).toBe('4d575354'); expect(view.getUint32(4)).toBe(1); expect(view.getUint32(8)).toBe(1700000000)
    expect(view.getUint32(12)).toBe(2); expect(view.getUint32(16)).toBe(used); expect(hex(file.subarray(20, 52))).toBe(HOST_BASE)
    expect(hex(file.subarray(52, 84))).toBe(createHash('sha256').update(file.subarray(84, used)).digest('hex'))
    expect(view.getUint32(84)).toBe(0x873d83cc); expect(view.getUint32(88)).toBe(48); expect(file.subarray(92, 140)).toEqual(pkg(0x873d83cc))
    expect(view.getUint32(140)).toBe(0x3cbedc9c); expect(view.getUint32(144)).toBe(41); expect(file.subarray(189, 192)).toEqual(new Uint8Array(3))
    expect(file.length).toBe(512); expect(file.subarray(used).every(byte => byte === 0)).toBe(true)
  })
  it('is byte for byte the file the base’s own code restores in sdk/tests/test_runtime_journal.py', () => {
    // Changed on purpose? Write this hex to the fixture; the C test then proves the base still takes it.
    expect(hex(fixture())).toBe(readFileSync(FIXTURE, 'utf8').trim())
  })
  it('outranks the unit’s own saves and earlier files, and leaves the unit room to count on', () => {
    expect(cardSetGeneration(Date.UTC(2026, 10, 11))).toBe(1794355200)
    expect(cardSetGeneration(1000 * 1000)).toBeLessThan(cardSetGeneration(1001 * 1000))
    for (const generation of [0, 1.5, 0xffffffff]) expect(() => encodeCardSet(HOST_BASE, [pkg(1)], generation)).toThrow(/generation/)
  })
  it('refuses what the base would not hold: a repeated, removing, foreign or oversized package', () => {
    const removal = pkg(7); new DataView(removal.buffer).setUint32(8, 0)
    const foreign = pkg(8); foreign[0] = 0
    for (const packages of [[pkg(5), pkg(5)], [removal], [foreign], [pkg(9).subarray(0, 31)]]) expect(() => encodeCardSet(HOST_BASE, packages, 5)).toThrow(/invalid or repeated/)
    expect(() => encodeCardSet(HOST_BASE, [pkg(5, SAVED_SET_CAPACITY)], 5)).toThrow(/too large/)
    expect(new DataView(encodeCardSet(HOST_BASE, [], 5).buffer).getUint32(16)).toBe(84) // an empty set: the unit starts without modules
  })
  it('writes a set from the published packages, as a sync onto an empty unit would send them', async () => {
    const entries = manifest.packages.slice(0, 3), load = async (entry: { path: string }) => new Uint8Array(readFileSync(new URL('../../../public/' + entry.path, import.meta.url)))
    const set = await prepareCardSet({ name: 'Card', moduleIds: entries.map(entry => entry.id), removedStockFx: [] }, load, 1794355200000)
    expect(set.layout).toBe('off'); expect(set.base).toBe(layoutIdentity('off')); expect(set.modules).toHaveLength(3)
    const view = new DataView(set.file.buffer)
    expect(view.getUint32(8)).toBe(1794355200); expect(view.getUint32(12)).toBe(3); expect(hex(set.file.subarray(20, 52))).toBe(set.base)
    let at = 84
    for (const entry of entries) {
      expect(view.getUint32(at + 4)).toBe(entry.bytes)
      expect(createHash('sha256').update(set.file.subarray(at + 8, at + 8 + entry.bytes)).digest('hex')).toBe(entry.sha256)
      at += 8 + Math.ceil(entry.bytes / 4) * 4
    }
    expect(view.getUint32(16)).toBe(at)
  })
})
