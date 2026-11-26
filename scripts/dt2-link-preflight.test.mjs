// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic USB descriptors, container and CPU instructions. No stock firmware is a test fixture.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { encodeSyx } from '../src/engine/elektron/sysex.ts'
import { inspectBase, inspectConfiguration, inspectProfile, inspectStock } from './dt2-link-preflight.mjs'

const config = (interfaces, count) => Uint8Array.from([9, 2, 0, 0, count, 1, 0, 0x80, 50, ...interfaces.flat()])
const iface = (number, alternate, endpoints, cls = 1, sub = 3) => [9, 4, number, alternate, endpoints, cls, sub, 0, 0]
const ep = (address, transfer = 2) => [7, 5, address, transfer, 0, 2, 0]
const midi = () => [iface(1, 0, 2), ep(1), ep(0x81)]
const core = { device: 'digitakt-mk2', os: '1.17', sites: [] }
const base = { core: 'core-dt2' }
const guards = [{ name: 'router', address: '0x4011ffda', length: 8 }]

describe('DT2 USB descriptor preflight', () => {
  it('reads templates whose total length is filled only at runtime', () => {
    const descriptors = config(midi(), 1)
    const found = inspectConfiguration(descriptors)
    expect(found[0].endpoints.map(e => e.address)).toEqual([1, 0x81])
    descriptors[2] = descriptors.length
    expect(inspectConfiguration(descriptors)).toEqual(found)
    descriptors[2]--
    expect(() => inspectConfiguration(descriptors)).toThrow('length disagrees')
  })
  it('bounds traversal when descriptors are truncated or have zero length', () => {
    const bytes = config(midi(), 1)
    expect(() => inspectConfiguration(bytes.subarray(0, -1))).toThrow('Truncated')
    bytes[9] = 0
    expect(() => inspectConfiguration(bytes)).toThrow('zero-length')
  })
  it('checks interface and endpoint counts and rejects duplicate settings', () => {
    expect(() => inspectConfiguration(config(midi(), 2))).toThrow('Interface count')
    expect(() => inspectConfiguration(config([iface(1, 0, 2), ep(1)], 1))).toThrow('endpoint count')
    expect(() => inspectConfiguration(config([iface(1, 0, 0), iface(1, 0, 0)], 1))).toThrow('Duplicate interface')
    expect(() => inspectConfiguration(config([iface(1, 0, 2), ep(1), ep(1)], 1))).toThrow('Duplicate endpoint')
    expect(() => inspectConfiguration(config([ep(1)], 0))).toThrow('Endpoint without')
  })
  it('allows one audio endpoint across alternate settings of its own interface', () => {
    const audio = [iface(0, 0, 0, 1, 2), iface(0, 1, 1, 1, 2), ep(3, 1), iface(0, 2, 1, 1, 2), ep(3, 1)]
    expect(inspectConfiguration(config([...audio, ...midi()], 2))).toHaveLength(4)
  })
})

function profileFixture(other = []) {
  const image = new Uint8Array(512), view = new DataView(image.buffer), load = 0x40000400
  // Invented memory locations and a standard device descriptor, not a stock table.
  const deviceAt = 64, configAt = 96
  const bytes = config([...other, ...midi()], other.length ? 2 : 1)
  view.setUint32(8, load + deviceAt)
  view.setUint32(12, load + configAt)
  view.setUint32(16, bytes.length)
  image.set([18, 1, 0, 2, 0, 0, 0, 64, 0x35, 0x19, 0x2b, 1, 0, 0, 0, 0, 0, 1], deviceAt)
  image.set(bytes, configAt)
  return { image, view, configAt, bindings: { mainLoad: load, profileTable: load, profileStride: 40, vid: 0x1935 },
    profile: { name: 'synthetic', index: 0, pid: 0x12b, midiInterface: 1 } }
}
const inspect = f => inspectProfile(f.image, f.bindings, f.profile)

describe('DT2 profile pointer and endpoint ownership checks', () => {
  it('follows a profile to its MIDI interface without relying on descriptor offsets', () => {
    const f = profileFixture([iface(0, 0, 1, 0xff, 0), ep(3)])
    expect(inspect(f)).toMatchObject({ midiInterface: 1, otherInterfaces: [0], pid: '0x12b' })
  })
  it('rejects device/configuration pointers or lengths outside MAIN', () => {
    for (const offset of [8, 12]) {
      const f = profileFixture()
      f.view.setUint32(offset, 0x3fffffff)
      expect(() => inspect(f)).toThrow('outside MAIN')
    }
    const f = profileFixture()
    f.view.setUint32(16, 0xffffffff)
    expect(() => inspect(f)).toThrow('outside MAIN')
  })
  it('refuses MIDI endpoint ownership by another interface', () => {
    expect(() => inspect(profileFixture([iface(0, 0, 1, 0xff, 0), ep(0x81)]))).toThrow('another interface')
  })
  it('refuses a different PID, transfer type or MIDI interface', () => {
    const f = profileFixture()
    expect(() => inspectProfile(f.image, f.bindings, { ...f.profile, pid: 1 })).toThrow('VID/PID')
    expect(() => inspectProfile(f.image, f.bindings, { ...f.profile, midiInterface: 4 })).toThrow('MIDIStreaming')
    f.image[f.configAt + 9 + 9 + 3] = 1
    expect(() => inspect(f)).toThrow('bulk MIDI endpoints')
  })
})

describe('DT2 base and provenance preflight', () => {
  it('rejects a hash-matched hook span that cuts an instruction', () => {
    // Invented NOP; MOVE.L #0x11223344,D0; RTS. Neither code nor container comes from stock.
    const image = Uint8Array.of(0x4e, 0x71, 0x20, 0x3c, 0x11, 0x22, 0x33, 0x44, 0x4e, 0x75)
    const container = new Uint8Array(0x30 + image.length), cv = new DataView(container.buffer)
    container.set([0x45, 0x4c, 0x45, 0x33])
    container.set(new TextEncoder().encode('1.17'), 0x14)
    cv.setUint32(0x1c, 1)
    cv.setUint32(0x20, 3)
    cv.setUint32(0x24, 0x30)
    cv.setUint32(0x28, image.length)
    cv.setUint32(0x2c, 0x40000400)
    container.set(image, 0x30)
    const stream = new Uint8Array(8 + container.length)
    new DataView(stream.buffer).setUint32(0, container.length)
    stream.set(container, 8)
    const framing = Uint8Array.of(0xf0, 0, 0x20, 0x3c, 0x14, 0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0xf7)
    const raw = encodeSyx(stream, 0x14, framing, framing)
    const sha = bytes => createHash('sha256').update(bytes).digest('hex')
    const pins = { stockSha256: sha(raw), mainSha256: sha(image), mainLength: image.length,
      mainLoad: '0x40000400', profiles: [], guards: [] }
    const guarded = length => ({ ...pins, guards: [{ name: 'invented site', purpose: 'patch-candidate',
      address: pins.mainLoad, length, sha256: sha(image.subarray(0, length)) }] })
    expect(() => inspectStock(raw, guarded(8))).not.toThrow()
    expect(() => inspectStock(raw, guarded(6))).toThrow('ends mid-instruction')
  })
  it('refuses a different stock file before parsing or decompressing it', () => {
    const bindings = JSON.parse(readFileSync(new URL('../sdk/machines/digitakt-ii/usb-link-bindings.json', import.meta.url)))
    expect(() => inspectStock(new Uint8Array([1, 2, 3]), bindings)).toThrow('SHA-256 mismatch')
  })
  it('checks core, common, add and dev sites, including optional additions', () => {
    for (const part of ['core', 'common', 'add', 'dev']) {
      const site = { addr: '0x4011ffde', len: 2, target: 'conflict' }
      expect(() => inspectBase(part === 'core' ? { ...core, sites: [{ ...site, stock: '0000' }] } : core,
        part === 'core' ? base : { ...base, [part]: { sites: [site] } }, guards)).toThrow('overlaps router')
    }
  })
  it('checks the whole patch interval and treats touching boundaries as disjoint', () => {
    const check = (addr, len) => inspectBase(core, { ...base, add: { sites: [{ addr, len }] } }, guards)
    expect(() => check('0x4011ffd0', 12)).toThrow('overlaps')
    expect(() => check('0x4011ffd0', 10)).not.toThrow()
    expect(() => check('0x4011ffe2', 2)).not.toThrow()
    expect(() => check('0xffffffff', 8)).toThrow('Invalid base site')
    expect(() => check('0x4011ffd0', -1)).toThrow('Invalid base site')
  })
  it('does not silently accept a DN2 or an unfamiliar recipe', () => {
    expect(() => inspectBase({ ...core, device: 'digitone-mk2' }, base, guards)).toThrow('DT2 OS 1.17')
    expect(() => inspectBase(core, { ...base, source: 'digitone-ii' }, guards)).toThrow('DT2 OS 1.17')
    expect(() => inspectBase(core, { ...base, recipe: {} }, guards)).toThrow('DT2 OS 1.17')
  })
})
