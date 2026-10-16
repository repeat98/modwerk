// SPDX-License-Identifier: GPL-3.0-or-later
// Syntakt (device 0x16) on the elemod platform: the linker profile, the stock map and the boot-probe core.
// Every address, length and guard comes from docs/SYNTAKT_OS_RESEARCH.md through the two JSON files under
// sdk/syntakt/core/; the only code here is Modwerk's own boot stub. The profile is deliberately not registered in the
// shared LINK_DEVICES table: builders and CI stay unchanged until the owner accepts it (the report's review items).
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

// The boot stub, Modwerk's own ColdFire ISA_A code, hand-assembled and checked by the decoder test:
//   replay the two displaced instructions of the BSS-clear entry (frame adjust, save D4-D7),
//   write a 16-byte signature into the proven-free SRAM tail so a trial can see that the hook ran,
//   jump back to stock at the continuation (a relocation fills the address).
const STUB_SIGNATURE = 0x4d57534b, STUB_VERSION = 0x00010000
export const SYNTAKT_BOOT_STUB = {
  hex: '4feffff0' + '48d700f0' + '41f9' + SYNTAKT_SRAM_TAIL[0].toString(16).padStart(8, '0') + '20fc' + STUB_SIGNATURE.toString(16).padStart(8, '0') +
    '20fc' + STUB_VERSION.toString(16).padStart(8, '0') + '20fc' + (SYNTAKT_SRAM_TAIL[1] - SYNTAKT_SRAM_TAIL[0]).toString(16).padStart(8, '0') + '20bc00000000' + '4ef900000000',
  resumeReloc: 40, signature: STUB_SIGNATURE, version: STUB_VERSION,
}

/** The boot-probe core as a format-2 elemod document for one release, parseable with `parseElemod(doc, 'core', [SYNTAKT_DEVICE])`. */
export function syntaktBootProbe(version: SyntaktRelease): Record<string, unknown> {
  const release = stockMap.releases[version], site = probe.releases[version].boot
  return {
    elemod: 2, id: 'core', version: probe.version, title: 'Modwerk Syntakt boot probe', category: 'system',
    target: { device: SYNTAKT_DEVICE.key, os: version, syx_sha256: release.syxSha256, section3_sha256: release.mainSha256 },
    sections: { '.boot': { align: 4, parts: [['hex', SYNTAKT_BOOT_STUB.hex]] } },
    symbols: { mw_boot: ['.boot', 0], mw_stock_resume: ['abs', hex(site.resume)] },
    relocs: [['.boot', SYNTAKT_BOOT_STUB.resumeReloc, 'abs32', 'sym:mw_stock_resume', 0]],
    // jmp (abs).l to the stub, then a nop to fill the 8 displaced bytes.
    sites: [{ addr: site.addr, len: site.len, new: '4ef900000000' + '4e71', kind: 'code', stock_sha256: site.stockSha256, relocs: [[2, 'abs32', 'sym:mw_boot', 0]] }],
  }
}

/** The declared sites of a probe build, in the stock-write checker's form. */
export function syntaktProbeSites(version: SyntaktRelease): DeclaredSite[] {
  const site = probe.releases[version].boot
  return [{ addr: hex(site.addr), length: site.len, kind: 'code', stockSha256: site.stockSha256, owner: 'core ' + probe.version }]
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
