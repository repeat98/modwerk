import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import probe from '../../../sdk/syntakt/core/probe.json'
import stockMap from '../../../sdk/syntakt/core/stock-map.json'
import { ILLEGAL, PCREL, decodeColdFire, readerAt } from './coldfire-isa'
import { ELE3_DEVICES } from './ele3'
import { linkMods, parseElemod, type LinkDevice } from './elemod'
import { checkStockWrites } from './stock-writes'
import { SYNTAKT_BOOT_STUB, SYNTAKT_DEVICE, SYNTAKT_GAP_STUB, SYNTAKT_RELEASES, SYNTAKT_SRAM_TAIL, SYNTAKT_STACK_GAP, assertSyntaktStackWord, syntaktBootProbe, syntaktProbeSites, syntaktStockMap } from './syntakt'

const hex = (text: string) => Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('Syntakt profile', () => {
  it('binds both researched releases by hash and offers no SDRAM to mods', () => {
    expect(SYNTAKT_RELEASES).toEqual(['1.40', '1.42'])
    expect(SYNTAKT_DEVICE.releases.map(r => [r.version, r.mainLength])).toEqual([['1.40', 3344272], ['1.42', 3442576]])
    expect(SYNTAKT_DEVICE.ddr).toEqual([0, 0])
    expect(SYNTAKT_STACK_GAP).toEqual([0x47fe0000, 0x48000000])
    expect(SYNTAKT_DEVICE.areas).toEqual({ 'sram-tail': [0x8000733c, 0x80008000] })
    expect(ELE3_DEVICES.syntakt).toMatchObject({ mainSection: 3, mainLoad: 0x40000400, stage: 0x40200000, sysexId: 0x16 })
    expect(ELE3_DEVICES.syntakt.flashAt + stockMap.releases['1.42'].containerBytes).toBeLessThanOrEqual(ELE3_DEVICES.syntakt.flashLimit)
    expect(ELE3_DEVICES.syntakt.flashLimit - ELE3_DEVICES.syntakt.flashAt).toBe(0x200000)
  })

  it('keeps the probe guards, the hook and the protected map consistent for every release', () => {
    for (const version of SYNTAKT_RELEASES) {
      const site = probe.releases[version].boot, map = syntaktStockMap(version)
      expect(site).toMatchObject({ addr: '0x400004b2', len: 8, resume: '0x400004ba' })
      expect(site.stockSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(map.tailHook).toBe(0x400004b2)
      expect(map.imageLength).toBe(SYNTAKT_DEVICE.releases.find(r => r.version === version)!.mainLength)
      for (const declared of syntaktProbeSites(version)) for (const [lo, hi] of map.protected) expect(declared.addr < hi && lo < declared.addr + declared.length).toBe(false)
      expect(map.protected.some(([lo, hi]) => lo <= 0x40000400 && 0x40000410 <= hi)).toBe(true)
      const release = stockMap.releases[version]
      expect(map.protected.some(([lo, hi]) => lo === parseInt(release.sramInitSource[0][0], 16) && hi === parseInt(release.imageEnd, 16))).toBe(true)
      expect(map.tailBudget).toBeLessThan(release.inplaceDepackMargin)
      const imageEnd = parseInt(release.imageEnd, 16), bssEnd = parseInt(release.bssEnd, 16)
      expect(parseInt(release.bssStart, 16)).toBeLessThanOrEqual(imageEnd)
      expect(imageEnd).toBeLessThan(bssEnd)
      expect(imageEnd + map.tailBudget).toBeLessThan(bssEnd)
    }
    expect(syntaktProbeSites('1.40').map(site => [site.addr, site.kind])).toEqual([[0x400004b2, 'code']])
    expect(syntaktProbeSites('1.42').map(site => [site.addr, site.kind])).toEqual([[0x400004b2, 'code'], [0x400004f4, 'data']])
    expect(probe.releases['1.40'].boot.stockSha256).toBe(probe.releases['1.42'].boot.stockSha256)
    expect(probe.releases['1.40'].stackTop.stockSha256).toBe(probe.releases['1.42'].stackTop.stockSha256)
    expect(SYNTAKT_SRAM_TAIL[0]).toBeGreaterThanOrEqual(0x80000000)
    expect(SYNTAKT_SRAM_TAIL[1]).toBeLessThanOrEqual(0x80010000)
  })

  it('assembles the boot stub as whole ColdFire instructions that end in the stock continuation jump', () => {
    const decode = (text: string) => {
      const bytes = hex(text), read = readerAt(bytes, 0), ops: string[] = [], branches: number[] = []
      for (let at = 0; at < bytes.length;) {
        const instruction = decodeColdFire(read(at), at)
        expect(instruction.flags & (PCREL | ILLEGAL)).toBe(0)
        ops.push(instruction.op + ':' + instruction.length)
        if (instruction.flow === 'bcc') branches.push(instruction.target ?? -1)
        at += instruction.length
        if (instruction.flow === 'jmp') expect(at).toBe(bytes.length)
      }
      return { bytes, ops, branches }
    }
    const opened = decode(SYNTAKT_BOOT_STUB.hex)
    expect(opened.ops).toEqual(['lea:4', 'movem:4', 'lea:6', 'move:6', 'move:6', 'move:6', 'move:6', 'jmp:6'])
    expect(opened.bytes.length).toBe(44)
    expect(SYNTAKT_BOOT_STUB.resumeReloc).toBe(40)
    const early = new DataView(opened.bytes.buffer)
    expect(early.getUint32(10)).toBe(SYNTAKT_SRAM_TAIL[0])
    expect(early.getUint32(16)).toBe(SYNTAKT_BOOT_STUB.signature)
    expect(early.getUint32(28)).toBe(SYNTAKT_SRAM_TAIL[1] - SYNTAKT_SRAM_TAIL[0])
    const gap = decode(SYNTAKT_GAP_STUB.hex)
    expect(gap.ops).toEqual([
      'lea:4', 'movem:4', 'lea:6', 'move:6', 'move:6', 'move:6', 'move:6', 'move:2', 'move:2',
      'lea:6', 'lea:6', 'move:6', 'tst:2', 'bcc:2', 'move:2', 'move:2', 'addq:2', 'bcc:2', 'movea:2', 'move:2', 'nop:2', 'jmp:6',
    ])
    expect(gap.branches).toEqual([0x48, 0x40])
    expect(gap.bytes.length).toBe(SYNTAKT_GAP_STUB.words * 4)
    expect(SYNTAKT_GAP_STUB.words * 4).toBeLessThanOrEqual(SYNTAKT_STACK_GAP[1] - SYNTAKT_STACK_GAP[0])
    const view = new DataView(gap.bytes.buffer)
    expect(view.getUint32(10)).toBe(SYNTAKT_SRAM_TAIL[0])
    expect(view.getUint32(16)).toBe(SYNTAKT_GAP_STUB.signature)
    expect(view.getUint32(28)).toBe(SYNTAKT_SRAM_TAIL[1] - SYNTAKT_SRAM_TAIL[0])
    expect(view.getUint32(SYNTAKT_GAP_STUB.destAt)).toBe(SYNTAKT_STACK_GAP[0])
    expect(view.getUint32(SYNTAKT_GAP_STUB.wordsAt)).toBe(SYNTAKT_GAP_STUB.words)
  })

  it('links the boot probe against a stand-in image and refuses any mod that needs SDRAM', async () => {
    // A stand-in 4 KiB image of NOPs with the Syntakt profile's shape: the hook sits at the real offset of the probe site.
    const image = Uint8Array.from({ length: 4096 }, (_, i) => (i % 2 ? 0x71 : 0x4e))
    const device: LinkDevice = { ...SYNTAKT_DEVICE, releases: [{ version: '1.42', syxSha256: 'a'.repeat(64), mainSha256: sha(image), mainLength: image.length }] }
    const doc = syntaktBootProbe('1.42') as Record<string, unknown> & { sites: { stock_sha256: string }[] }
    doc.target = { device: 'syntakt', os: '1.42', syx_sha256: 'a'.repeat(64), section3_sha256: sha(image) }
    doc.sites[0].stock_sha256 = sha(image.subarray(0xb2, 0xba))
    doc.sites[1].stock_sha256 = sha(image.subarray(0xf4, 0xf8))
    const linked = await linkMods([parseElemod(doc, 'core', [device])], image)
    const view = new DataView(linked.image.buffer)
    const glued = 0x40000400 + image.length
    expect(view.getUint16(0xb2)).toBe(0x4ef9)
    expect(view.getUint32(0xb4)).toBe(glued)
    expect(view.getUint16(0xb8)).toBe(0x4e71)
    expect(view.getUint32(0xf4)).toBe(SYNTAKT_STACK_GAP[0])
    expect(() => assertSyntaktStackWord(linked.image)).not.toThrow()
    expect(linked.image.length).toBe(image.length + 96)
    expect(view.getUint32(image.length + SYNTAKT_GAP_STUB.resumeReloc)).toBe(0x400004ba)
    expect(view.getUint32(image.length + SYNTAKT_GAP_STUB.sourceReloc)).toBe(glued)
    expect(view.getUint32(image.length + SYNTAKT_GAP_STUB.destAt)).toBe(SYNTAKT_STACK_GAP[0])
    const sites = syntaktProbeSites('1.42').map(site => ({ ...site, stockSha256: sha(image.subarray(site.addr - 0x40000400, site.addr - 0x40000400 + site.length)) }))
    const map = { ...syntaktStockMap('1.42'), imageLength: image.length }
    const report = await checkStockWrites(image, linked.image, map, sites)
    expect(report).toMatchObject({ changed: [[0xb3, 0xb8], [0xf4, 0xf8]], tail: 96, sites: 2 })
    const stray = linked.image.slice()
    stray[0x300] ^= 0xff
    await expect(checkStockWrites(image, stray, map, sites)).rejects.toThrow('0x40000700-0x40000701 change outside every declared site')
    const mod = { elemod: 2, id: 'needy', version: '1.0', target: doc.target, sections: { '.run': { parts: [['hex', '4e75']] } }, symbols: {} }
    await expect(linkMods([parseElemod(doc, 'core', [device]), parseElemod(mod, 'needy', [device])], image)).rejects.toThrow('need RAM')
    const fast = { ...mod, id: 'fast', sections: { '.fast': { parts: [['hex', '4e75']] } } }
    await expect(linkMods([parseElemod(doc, 'core', [device]), parseElemod(fast, 'fast', [device])], image)).rejects.toThrow('.fast code')
  })

  it('leaves the 1.40 boot probe without the stack word or the copy', async () => {
    const image = Uint8Array.from({ length: 4096 }, (_, i) => (i % 2 ? 0x71 : 0x4e))
    const device: LinkDevice = { ...SYNTAKT_DEVICE, releases: [{ version: '1.40', syxSha256: 'a'.repeat(64), mainSha256: sha(image), mainLength: image.length }] }
    const doc = syntaktBootProbe('1.40') as Record<string, unknown> & { sites: { stock_sha256: string }[]; sections: { '.boot': { parts: [string, string][] } } }
    expect(doc.sites).toHaveLength(1)
    doc.target = { device: 'syntakt', os: '1.40', syx_sha256: 'a'.repeat(64), section3_sha256: sha(image) }
    doc.sites[0].stock_sha256 = sha(image.subarray(0xb2, 0xba))
    const linked = await linkMods([parseElemod(doc, 'core', [device])], image)
    const view = new DataView(linked.image.buffer)
    expect(linked.image.length).toBe(image.length + 48)
    expect(view.getUint32(0xf4)).toBe(0x4e714e71)
    expect(view.getUint32(image.length + SYNTAKT_BOOT_STUB.resumeReloc)).toBe(0x400004ba)
    expect(doc.sections['.boot'].parts[0][1]).toBe(SYNTAKT_BOOT_STUB.hex)
  })

  it('refuses the probe for a file that is not a known release', () => {
    const doc = syntaktBootProbe('1.42') as Record<string, unknown>
    doc.target = { device: 'syntakt', os: '1.42', syx_sha256: 'b'.repeat(64), section3_sha256: 'c'.repeat(64) }
    expect(() => parseElemod(doc, 'core', [SYNTAKT_DEVICE])).toThrow('firmware Modwerk does not know')
  })

  it('requires the built 1.42 stack word to be the gap start', () => {
    const image = new Uint8Array(0x100)
    const view = new DataView(image.buffer)
    view.setUint32(0xf4, SYNTAKT_STACK_GAP[0])
    expect(() => assertSyntaktStackWord(image)).not.toThrow()
    view.setUint32(0xf4, 0x48000000)
    expect(() => assertSyntaktStackWord(image)).toThrow('0x48000000')
    view.setUint32(0xf4, 0x40000000)
    expect(() => assertSyntaktStackWord(image)).toThrow('0x40000000')
    expect(() => assertSyntaktStackWord(image.subarray(0, 0xf4))).toThrow('does not contain the stack word')
  })

  it('places the gap 128 KB under the old stack top, above the 1.42 wipe and the reported writer', () => {
    const lo = Number.parseInt(stockMap.candidates['ddr-top'].lo, 16)
    const hi = Number.parseInt(stockMap.candidates['ddr-top'].hi, 16)
    const bssEnd = Number.parseInt(stockMap.releases['1.42'].bssEnd, 16)
    const heapEnd = Number.parseInt(stockMap.releases['1.42'].heapPool[1], 16)
    // Research L9: hardware-observed page writes reached 0x47eff000. Not a heap address.
    const writerTop = 0x47eff000
    expect(SYNTAKT_STACK_GAP).toEqual([lo, hi])
    expect(hi).toBe(0x48000000)
    expect(lo).toBe(0x48000000 - 128 * 1024)
    expect(lo).toBeGreaterThan(bssEnd)
    expect(lo).toBeGreaterThan(heapEnd)
    expect(lo).toBeGreaterThan(writerTop)
    expect(bssEnd).toBe(0x45566490)
    expect(heapEnd).toBeLessThan(bssEnd)
  })

  it('matches boot.s instruction lines to the shipped stub bytes', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../sdk/syntakt/core/boot.s'), 'utf8')
    const marker = source.indexOf('| ----- OS 1.42 continues here.')
    expect(marker).toBeGreaterThan(0)
    const shared = sourceLines(source.slice(0, marker))
    const rest = sourceLines(source.slice(marker))
    expect(rest.at(-1)?.code).toBe('jmp mw_stock_resume')
    compareStub(shared.concat(rest.at(-1)!), SYNTAKT_BOOT_STUB.hex)
    compareStub(shared.concat(rest), SYNTAKT_GAP_STUB.hex)
  })
})

type SourceLine = { label: string | null; code: string; mnemonic: string; operands: string }

function sourceLines(region: string): SourceLine[] {
  const lines: SourceLine[] = []
  let label: string | null = null
  for (const raw of region.split('\n')) {
    const code = raw.replace(/\|.*$/, '').trim().replace(/\s+/g, ' ')
    if (!code || code.startsWith('.')) continue
    if (code.endsWith(':')) { label = code.slice(0, -1); continue }
    const split = code.indexOf(' ')
    lines.push({ label, code, mnemonic: (split < 0 ? code : code.slice(0, split)).toLowerCase(), operands: split < 0 ? '' : code.slice(split + 1) })
    label = null
  }
  return lines
}

/** Decoder class for one boot.s line. move.l into an address register is the movea encoding; subq.l shares the decoder's addq class. */
function stubClass(line: SourceLine): string {
  if (line.code === 'move.l (%sp)+,%a1') return 'movea'
  if (line.mnemonic === 'subq.l' && line.operands.replace(/\s+/g, '') === '#1,%d1') return 'addq'
  if (line.mnemonic === 'beq.s' || line.mnemonic === 'bne.s') return 'bcc'
  if (line.mnemonic === 'movem.l') return 'movem'
  if (line.mnemonic === 'move.l') return 'move'
  if (line.mnemonic === 'tst.l') return 'tst'
  if (line.mnemonic === 'lea' || line.mnemonic === 'nop' || line.mnemonic === 'jmp') return line.mnemonic
  throw new Error('boot.s line has no decoder class: ' + line.code)
}

function compareStub(source: SourceLine[], text: string) {
  const bytes = hex(text), read = readerAt(bytes, 0)
  const decoded: { at: number; op: string; length: number; target?: number; raw: Uint8Array }[] = []
  for (let at = 0; at < bytes.length;) {
    const instruction = decodeColdFire(read(at), at)
    decoded.push({ at, op: instruction.op, length: instruction.length, target: instruction.target, raw: bytes.subarray(at, at + instruction.length) })
    at += instruction.length
  }
  expect(source.map(stubClass)).toEqual(decoded.map(instruction => instruction.op))
  const labels = new Map(source.flatMap((line, index) => line.label ? [[line.label, decoded[index].at] as const] : []))
  source.forEach((line, index) => {
    const raw = decoded[index].raw
    if (line.code === 'move.l (%sp)+,%a1') expect(Buffer.from(raw).toString('hex')).toBe('225f')
    if (line.mnemonic === 'subq.l') expect(Buffer.from(raw).toString('hex')).toBe('5381')
    if (line.mnemonic === 'beq.s') expect(raw[0]).toBe(0x67)
    if (line.mnemonic === 'bne.s') expect(raw[0]).toBe(0x66)
    if (line.mnemonic === 'beq.s' || line.mnemonic === 'bne.s') expect(decoded[index].target).toBe(labels.get(line.operands))
  })
}
