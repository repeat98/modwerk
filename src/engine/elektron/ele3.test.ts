import { describe, expect, it } from 'vitest'
import { packSection } from '../aplib'
import { CHUNK_SIZE, contentChecksum, decodeDataMessages, encode8in7, encodeSyx, framingCount, packetChecksum, splitMessages } from './sysex'
import { MATCH_WINDOW, classifySection, inplaceDepack, mainImage, packMain, readEle3Syx, verifyEle3Build, writeEle3Syx, type Ele3Device } from './ele3'

// A synthetic device and container: no Elektron firmware is involved.
const device: Ele3Device = { mainSection: 3, mainLoad: 0x40000400, stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x380000, sysexId: 0x0a }
const framing = (count: number) => Uint8Array.from([0xf0, 0x00, 0x20, 0x3c, 0x0a, 0x00, 0x7d, 0x00, 0x10, 0x01, 0x02, 0x03, (count >> 14) & 0x7f, (count >> 7) & 0x7f, count & 0x7f, 0xf7])
const pattern = (length: number, seed: number) => Uint8Array.from({ length }, (_, i) => (i * seed + (i >> 5)) & 0xff)

function syntheticSyx(main: Uint8Array) {
  const sections = [{ id: 5, data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7]) }, { id: 3, data: packSection(main) }, { id: 4, data: pattern(300, 7) }]
  const dataStart = 0x20 + sections.length * 16 + 16
  const parts: number[] = []
  const container = new Uint8Array(dataStart)
  container.set([0x45, 0x4c, 0x45, 0x33]) // ELE3
  container.set([0x54, 0x45, 0x53, 0x54], 0x14) // version TEST
  const view = new DataView(container.buffer)
  view.setUint32(0x1c, sections.length)
  let at = dataStart
  sections.forEach((section, index) => {
    view.setUint32(0x20 + index * 16, section.id); view.setUint32(0x24 + index * 16, at); view.setUint32(0x28 + index * 16, section.data.length); view.setUint32(0x2c + index * 16, 0x40000000 + index)
    const padded = new Uint8Array(section.data.length + (-section.data.length & 15)); padded.set(section.data)
    parts.push(...padded); at += padded.length
  })
  const full = new Uint8Array(at); full.set(container); full.set(parts, dataStart)
  const stream = new Uint8Array(8 + full.length)
  new DataView(stream.buffer).setUint32(0, full.length); new DataView(stream.buffer).setUint32(4, contentChecksum(full)); stream.set(full, 8)
  return encodeSyx(stream, 0x0a, framing(0), framing(0))
}

describe('Elektron SysEx transport', () => {
  it('round-trips 8-in-7 data, including a short final group', () => {
    // Each message carries one 101-byte chunk, encoded on its own: 15 groups, the last of three bytes.
    const data = pattern(CHUNK_SIZE * 3, 131)
    const payloads = [0, 1, 2].map(index => encode8in7(data.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)))
    expect(payloads.every(payload => payload.length === 116 && payload.every(byte => byte < 0x80))).toBe(true)
    const messages = payloads.map(payload => { const m = new Uint8Array(128); m.set(payload, 10); return m })
    expect(decodeDataMessages(messages)).toEqual(data)
    expect(encode8in7(Uint8Array.from([0x80, 1, 2]))).toEqual(Uint8Array.from([0x40, 0, 1, 2]))
  })

  it('frames data messages with counters, checksums and the message count', () => {
    const syx = encodeSyx(pattern(250, 3), 0x0a, framing(0), framing(0))
    const messages = splitMessages(syx)
    expect(messages).toHaveLength(2 + 3)
    expect(framingCount(messages[0])).toBe(3)
    messages.slice(1, -1).forEach((message, index) => {
      expect(message).toHaveLength(128)
      expect((message[7] << 14) | (message[8] << 7) | message[9]).toBe(242 + index)
      expect(message[126]).toBe(packetChecksum(message.subarray(1, 127), 0x10))
    })
  })

  it('computes the content checksum as indexed word sums', () => {
    expect(contentChecksum(Uint8Array.from([0, 0, 0, 5, 0, 0, 0, 1]))).toBe((1 ^ 5) + (2 ^ 1))
    expect(contentChecksum(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))).toBe((1 ^ 0xffffffff) >>> 0)
  })
})

describe('ELE3 container', () => {
  const main = pattern(20000, 13)
  const raw = syntheticSyx(main)
  const stock = readEle3Syx(raw)

  it('reads the table, sections and version', () => {
    expect(stock.table.map(section => section.id)).toEqual([5, 3, 4])
    expect(stock.version).toBe('TEST')
    expect(classifySection(stock.stored.get(3)!)).toBe('packed')
    expect(mainImage(stock, device)).toEqual(main)
  })

  it('rebuilds the stock file byte for byte from its own main OS', () => {
    expect(writeEle3Syx(stock, stock.stored.get(3)!, device)).toEqual(raw)
  })

  it('verifies a rebuilt main OS, including the in-place depack', () => {
    const changed = main.slice(); changed[100] ^= 0xff
    const output = writeEle3Syx(stock, packMain(changed), device, 'MW01')
    const facts = verifyEle3Build(output, stock, changed, device, 'MW01')
    expect(facts.version).toBe('MW01')
    expect(facts.inplaceGap).toBeGreaterThan(0)
    expect(inplaceDepack(readEle3Syx(output).stored.get(3)!, device).image).toEqual(changed)
  })

  it('refuses tampered builds', () => {
    const output = writeEle3Syx(stock, packMain(main), device)
    const flipped = output.slice(); flipped[16 + 128 + 40] ^= 0x01
    expect(() => verifyEle3Build(flipped, stock, main, device)).toThrow(/checksum|depack|stock/)
    expect(() => verifyEle3Build(output, stock, pattern(20000, 17), device)).toThrow('expected image')
    expect(() => writeEle3Syx(stock, packMain(main), device, 'TOO LONG')).toThrow('4 printable characters')
  })

  it('stores a packed main OS as Elektron does: zeros up to a 4-byte boundary, counted in the table', () => {
    let padded = 0
    for (let seed = 1; seed <= 16; seed++) {
      const image = pattern(3000 + seed * 37, seed), stream = packSection(image, MATCH_WINDOW), stored = packMain(image)
      expect(stored.length % 4).toBe(0)
      expect(stored.length - stream.length).toBeLessThan(4)
      expect(stored.subarray(0, stream.length)).toEqual(stream)
      expect(stored.subarray(stream.length).every(byte => byte === 0)).toBe(true)
      expect(classifySection(stored)).toBe('packed')
      if (stored.length > stream.length) padded++
    }
    expect(padded).toBeGreaterThan(0)
    const output = writeEle3Syx(stock, packMain(main), device)
    expect(readEle3Syx(output).table.find(section => section.id === 3)!.length % 4).toBe(0)
    expect(verifyEle3Build(output, stock, main, device).mainImage).toBe(main.length)
  })
})
