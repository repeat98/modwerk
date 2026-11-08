import { describe, expect, it } from 'vitest'
import { packSection } from '../aplib'
import { contentChecksum, encodeSyx, splitMessages } from './sysex'
import { ELE2_DEVICES, mainImage, readEle2Syx, verifyEle2Build, writeEle2Syx, type Ele2Device } from './ele2'

// A synthetic device and container: no Elektron firmware is involved.
const device: Ele2Device = { mainLoad: 0x40000400, stage: 0x40200000, flashAt: 0x20000, flashLimit: 0x780000, sysexId: 0x07, keep: [[0x40000500, 0x40000540, 'the test range']] }
const framing = (count: number) => Uint8Array.from([0xf0, 0x00, 0x20, 0x3c, 0x07, 0x00, 0x7f, 0x00, 0x02, 0x01, 0x02, 0x03, (count >> 14) & 0x7f, (count >> 7) & 0x7f, count & 0x7f, 0xf7])
const pattern = (length: number, seed: number) => Uint8Array.from({ length }, (_, i) => (i * seed + (i >> 5)) & 0xff)
const main = pattern(9000, 13)

function syntheticSyx(image: Uint8Array) {
  const stored = packSection(image), length = 0x18 + stored.length
  const container = new Uint8Array(length + (-length & 3))
  container.set(Array.from('ELE20176        TEST', character => character.charCodeAt(0)))
  new DataView(container.buffer).setUint32(0x14, 0x40000400)
  container.set(stored, 0x18)
  const stream = new Uint8Array(8 + container.length)
  new DataView(stream.buffer).setUint32(0, container.length); new DataView(stream.buffer).setUint32(4, contentChecksum(container)); stream.set(container, 8)
  return encodeSyx(stream, 0x07, framing(0), framing(0))
}

describe('ELE2 containers', () => {
  const raw = syntheticSyx(main), stock = readEle2Syx(raw)

  it('reads the header, the stream and the main image', () => {
    expect(stock.version).toBe('TEST')
    expect(stock.load).toBe(0x40000400)
    expect(stock.deviceId).toBe(0x07)
    expect(mainImage(stock)).toEqual(main)
  })

  it('rewrites a stock file byte for byte from its own stream', () => {
    expect(writeEle2Syx(stock, stock.stored)).toEqual(raw)
  })

  it('builds and verifies a changed main OS with a new version', () => {
    const changed = main.slice(); changed.set([1, 2, 3, 4], 0x800)
    const output = writeEle2Syx(stock, packSection(changed), 'MW04')
    const facts = verifyEle2Build(output, stock, changed, device, 'MW04')
    expect(facts.version).toBe('MW04')
    expect(facts.mainImage).toBe(changed.length)
    expect(facts.containerLength % 4).toBe(0)
    expect(facts.inplaceGap).toBeGreaterThan(0)
    expect(splitMessages(output)).toHaveLength(facts.messages)
  })

  it('refuses a build that changes a kept range', () => {
    const changed = main.slice(); changed[0x120] ^= 1
    expect(() => verifyEle2Build(writeEle2Syx(stock, packSection(changed)), stock, changed, device)).toThrow('the test range')
  })

  it('refuses a header change outside the version field and a container past the flash limit', () => {
    const output = writeEle2Syx(stock, stock.stored), file = readEle2Syx(output)
    const header = file.container.slice(); header[5] ^= 1
    const stream = new Uint8Array(8 + header.length)
    new DataView(stream.buffer).setUint32(0, header.length); new DataView(stream.buffer).setUint32(4, contentChecksum(header)); stream.set(header, 8)
    expect(() => verifyEle2Build(encodeSyx(stream, 0x07, framing(0), framing(0)), stock, main, device)).toThrow('outside the version field')
    expect(() => verifyEle2Build(output, stock, main, { ...device, flashLimit: device.flashAt + 100 })).toThrow('does not fit the flash')
  })

  it('refuses a version that is not 4 printable characters and a file without ELE2', () => {
    expect(() => writeEle2Syx(stock, stock.stored, 'MW1')).toThrow('exactly 4')
    expect(() => readEle2Syx(encodeSyx(new Uint8Array(64), 0x07, framing(0), framing(0)))).toThrow('no ELE2 container')
  })

  it('keeps the MKI bootstrap and its version check', () => {
    expect(ELE2_DEVICES['analog-rytm-mki'].keep.map(([start, stop]) => [start, stop])).toEqual([[0x40000592, 0x400005d8], [0x4028c768, 0x402a1b84]])
  })
})
