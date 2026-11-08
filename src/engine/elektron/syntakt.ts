// SPDX-License-Identifier: GPL-3.0-or-later
// Syntakt (device 0x16) on the elemod platform: the linker profile, the stock map and the core.
// Every address, length and guard comes from docs/SYNTAKT_OS_RESEARCH.md through the two JSON files under
// sdk/syntakt/core/; the only code here is Modwerk's own boot stub. OS 1.40 stays the boot probe. OS 1.42 lowers the
// factory stack by one declared data word and the stub copies itself into the gap that opens above it. The profile is
// deliberately not registered in the shared LINK_DEVICES table, and it still offers mods no SDRAM area.
import probe from '../../../sdk/syntakt/core/probe.json' with { type: 'json' }
import stockMap from '../../../sdk/syntakt/core/stock-map.json' with { type: 'json' }
import { ELE3_DEVICES, inplaceDepack, mainImage, packMain, readEle3Syx, verifyEle3Build, writeEle3Syx, type Ele3BuildFacts, type Ele3File } from './ele3.ts'
import { linkMods, parseElemod, type Linked, type LinkDevice, type LinkRelease } from './elemod.ts'
import { checkStockWrites, type DeclaredSite, type StockMap, type StockWriteReport } from './stock-writes.ts'
import { sha256Hex } from './hash.ts'

export type SyntaktRelease = keyof typeof stockMap.releases
export const SYNTAKT_RELEASES = Object.keys(stockMap.releases) as SyntaktRelease[]

const hex = (value: string) => Number.parseInt(value, 16)
const range = (pair: readonly [string, string] | readonly string[]): [number, number] => [hex(pair[0]), hex(pair[1])]

export const SYNTAKT_SRAM_TAIL: [number, number] = [hex(stockMap.areas['sram-tail'].lo), hex(stockMap.areas['sram-tail'].hi)]

/** The Syntakt linker profile: no SDRAM area yet (the research proved none), so only a `.boot`-only core links. */
export const SYNTAKT_DEVICE: LinkDevice = {
  key: 'syntakt', machine: 'syntakt', name: 'Syntakt', sysexId: ELE3_DEVICES.syntakt.sysexId, mainLoad: hex(stockMap.mainLoad),
  releases: SYNTAKT_RELEASES.map((version): LinkRelease => {
    const release = stockMap.releases[version]
    return { version, syxSha256: release.syxSha256, mainSha256: release.mainSha256, mainLength: release.mainLength }
  }),
  areas: { 'sram-tail': SYNTAKT_SRAM_TAIL },
  ddr: [0, 0], sramCode: [0, 0], fastTable: '',
  protected: stockMap.protected.map(([lo, hi, why]) => [hex(lo), hex(hi), why]),
}

/** The stock map a build is checked against: protected ranges that hold in every release plus the release's own data. */
export function syntaktStockMap(version: SyntaktRelease): StockMap {
  const release = stockMap.releases[version]
  const sramInit = release.sramInitSource.map(range)
  return {
    mainLoad: hex(stockMap.mainLoad), imageLength: release.mainLength, tailBudget: stockMap.tailBudget, tailHook: hex(probe.releases[version].boot.addr),
    protected: [
      ...SYNTAKT_DEVICE.protected,
      [sramInit[0][0], sramInit[sramInit.length - 1][1], 'the SRAM initialisation data the reset copies into on-chip SRAM'],
      [hex(release.heapDescriptor), hex(release.heapDescriptor) + 32, 'the heap descriptor'],
      [hex(release.sysexRegistry), hex(release.sysexRegistry) + 0x7b0, 'the SysEx product registry and handler tables'],
    ],
  }
}

// The boot stub, Modwerk's own ColdFire ISA_A code, hand-assembled and checked by the decoder test.
// At the hook A0 and D1 are free and D4-D7 must be preserved, which the two replayed instructions do.
//   replay the two displaced instructions of the BSS-clear entry (frame adjust, save D4-D7),
//   write a 16-byte signature into the proven-free SRAM tail so a trial can see that the hook ran,
//   on 1.42, copy this stub into the stack gap, then
//   jump back to stock at the continuation (a relocation fills the address).
const STUB_SIGNATURE = 0x4d57534b, STUB_VERSION = 0x00010000
const markWrites = (
  '41f9' + SYNTAKT_SRAM_TAIL[0].toString(16).padStart(8, '0')
  + '20fc' + STUB_SIGNATURE.toString(16).padStart(8, '0')
  + '20fc' + STUB_VERSION.toString(16).padStart(8, '0')
  + '20fc' + (SYNTAKT_SRAM_TAIL[1] - SYNTAKT_SRAM_TAIL[0]).toString(16).padStart(8, '0')
  + '20bc00000000'
) // point at 0x8000733c, then store MWSK, the version, the length 3,268, and a zero.
export const SYNTAKT_BOOT_STUB = {
  hex: '4feffff0' + '48d700f0' + markWrites + '4ef900000000',
  resumeReloc: 40, signature: STUB_SIGNATURE, version: STUB_VERSION,
}

/** The 128 KB above the lowered stack. The stack grows down, so the core's staying copy lives here. */
export const SYNTAKT_STACK_GAP: [number, number] = [hex(stockMap.candidates['ddr-top'].lo), hex(stockMap.candidates['ddr-top'].hi)]

// 1.42 only. D0 and A1 are saved because only A0 and D1 start free. The copy is longwords through D0:
// ColdFire has no memory-to-memory move. The word count is this stub's own length, so the staying copy
// is the whole glued-on stub. Source and resume addresses are relocations.
function gapStub() {
  const prefix = '4feffff0' + '48d700f0' + markWrites + '2f00' + '2f09'
  const source = '41f900000000', dest = '43f9' + SYNTAKT_STACK_GAP[0].toString(16).padStart(8, '0'), countOp = '223c'
  // tst.l d1; beq.s over the 8-byte loop; move.l (a0)+,d0; move.l d0,(a1)+; subq.l #1,d1; bne.s back;
  // restore a1, d0; nop to a longword boundary; jmp resume.
  const tail = '4a81' + '6708' + '2018' + '22c0' + '5381' + '66f8' + '225f' + '201f' + '4e71' + '4ef900000000'
  const bytes = (prefix.length + source.length + dest.length + countOp.length + 8 + tail.length) / 2
  if (bytes % 4 !== 0) throw new Error('The stack-gap stub is not a whole number of longwords.')
  const hex = prefix + source + dest + countOp + (bytes / 4).toString(16).padStart(8, '0') + tail
  return {
    hex, words: bytes / 4, signature: STUB_SIGNATURE, version: STUB_VERSION,
    sourceReloc: prefix.length / 2 + 2, destAt: (prefix.length + source.length) / 2 + 2,
    wordsAt: (prefix.length + source.length + dest.length) / 2 + 2, resumeReloc: bytes - 4,
  }
}
export const SYNTAKT_GAP_STUB = gapStub()

/** The core as a format-2 elemod document. OS 1.40 stays the boot probe. OS 1.42 also lowers the stack and copies itself into the gap. */
export function syntaktBootProbe(version: SyntaktRelease): Record<string, unknown> {
  const release = stockMap.releases[version], boot = probe.releases[version].boot, gap = version === '1.42'
  const stub = gap ? SYNTAKT_GAP_STUB : SYNTAKT_BOOT_STUB
  const relocs: unknown[] = [['.boot', stub.resumeReloc, 'abs32', 'sym:mw_stock_resume', 0]]
  // jmp (abs).l to the stub, then a nop to fill the 8 displaced bytes.
  const sites: Record<string, unknown>[] = [{ addr: boot.addr, len: boot.len, new: '4ef900000000' + '4e71', kind: 'code', stock_sha256: boot.stockSha256, relocs: [[2, 'abs32', 'sym:mw_boot', 0]] }]
  if (gap) {
    const stack = probe.releases[version].stackTop
    relocs.push(['.boot', SYNTAKT_GAP_STUB.sourceReloc, 'abs32', 'sym:mw_boot', 0])
    sites.push({ addr: stack.addr, len: stack.len, new: SYNTAKT_STACK_GAP[0].toString(16).padStart(8, '0'), kind: 'data', stock_sha256: stack.stockSha256 })
  }
  return {
    elemod: 2, id: 'core', version: probe.version, title: gap ? 'Modwerk Syntakt core' : 'Modwerk Syntakt boot probe', category: 'system',
    target: { device: SYNTAKT_DEVICE.key, os: version, syx_sha256: release.syxSha256, section3_sha256: release.mainSha256 },
    sections: { '.boot': { align: 4, parts: [['hex', stub.hex]] } },
    symbols: { mw_boot: ['.boot', 0], mw_stock_resume: ['abs', hex(boot.resume)] },
    relocs, sites,
  }
}

/** The declared sites of a build, in the stock-write checker's form. The 1.42 stack word is the only data site. */
export function syntaktProbeSites(version: SyntaktRelease): DeclaredSite[] {
  const boot = probe.releases[version].boot
  const sites: DeclaredSite[] = [{ addr: hex(boot.addr), length: boot.len, kind: 'code', stockSha256: boot.stockSha256, owner: 'core ' + probe.version }]
  if (version === '1.42') {
    const stack = probe.releases[version].stackTop
    sites.push({ addr: hex(stack.addr), length: stack.len, kind: 'data', stockSha256: stack.stockSha256, owner: 'core ' + probe.version })
  }
  return sites
}

export type SyntaktProbeBuild = { release: SyntaktRelease; linked: Linked; writes: StockWriteReport; syx: Uint8Array; facts: Ele3BuildFacts; stockMargin: number }

/** Link the boot probe into the owner's stock file, check every stock write and rebuild the container. Local use only. */
export async function buildSyntaktBootProbe(stockSyx: Uint8Array): Promise<SyntaktProbeBuild> {
  const container: Ele3File = readEle3Syx(stockSyx), device = ELE3_DEVICES.syntakt
  if (container.deviceId !== device.sysexId) throw new Error('This OS file is not for the Syntakt.')
  const image = mainImage(container, device), imageSha256 = await sha256Hex(image)
  const release = SYNTAKT_RELEASES.find(version => stockMap.releases[version].mainSha256 === imageSha256 && stockMap.releases[version].mainLength === image.length)
  if (!release) throw new Error('This Syntakt OS file is not a release the probe knows.')
  const parsed = parseElemod(syntaktBootProbe(release), 'core', [SYNTAKT_DEVICE])
  const linked = await linkMods([parsed], image)
  const writes = await checkStockWrites(image, linked.image, syntaktStockMap(release), syntaktProbeSites(release))
  const stockMargin = inplaceDepack(container.stored.get(device.mainSection)!, device).gap
  const syx = writeEle3Syx(container, packMain(linked.image), device, 'MW01')
  const facts = verifyEle3Build(syx, container, linked.image, device, 'MW01')
  return { release, linked, writes, syx, facts, stockMargin }
}
