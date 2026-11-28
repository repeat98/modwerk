// SPDX-License-Identifier: GPL-3.0-or-later
// The machines the firmware builder knows: each stock OS release by its hashes, where the main OS lives and loads,
// its container and version field, and the memory a module set may use. Facts from public research on the stock
// files; a build refuses any file that is not one of these releases.
import { str } from './py.ts'

export class UnknownFirmware extends Error {}

export type Release = {
  /** The OS version as Elektron names it. */ version: string
  /** The stock .syx file. */ syxSha256: string
  /** Its main OS section, depacked, and that section's length. */ mainSha256: string; mainLen: number
  /** The stock card file (.bin), where the machine has one. */ binSha256: string
}

export type Range = [number, number]

export type Device = {
  key: string
  name: string
  sysexId: number
  releases: Release[]
  mainSection: number
  mainLoad: number
  /** Where the in-place unpack stages the main OS; null: unknown, so it is not simulated. */
  stage: number | null
  flashAt: number
  flashLimit: number
  trailer: null | 'hmac'
  isa: 'coldfire'
  /** For an 'hmac' trailer: the section and seed text the key is derived from. */
  hmacKeyFrom: [number, string] | null
  container: 'ele3' | 'elek'
  versionLen: number
  /** 'ele3': where the version field sits in the container header. */
  versionAt: number
  /** A build given no version keeps the stock field. */
  versionOptional: boolean
  /** Main OS bytes no module may change. */
  protected: [number, number, string][]
  relocatable: [number, number, number[], string][]
  blobMax: number | null
  areas: Record<string, Range>
  ddr: Range
  /** [core version, area]: from that core on, the linker's area in place of ddr. */
  coreDdr: [string, Range][]
  /** [table, at, count, prefix]: a contribution to `table` points at a descriptor whose long at +at is a sound slot;
   * the module claims prefix:<slot>. */
  slotClaims: [string, number, number, string][]
  sramCode: Range
  fastTable: string
  imageFree: Range[]
  /** [unit, {symbol: [a, b]}]: a RAM reserve sized to the modules. */
  reserve: [number, Record<string, [number, number]>] | null
  /** tag -> [address, length]: DSP code the main OS uploads at boot. */
  dspPayloads: Record<string, Range>
  /** [tag, lo, hi, claim, what]: DSP program words a module frees by claiming `claim`. */
  dspAreas: [string, number, number, string, string][]
  recovery: string
}

const release = (version: string, syxSha256: string, mainSha256: string, mainLen: number, binSha256 = ''): Release => ({ version, syxSha256, mainSha256, mainLen, binSha256 })

/** What most machines share; each profile below overrides its own. */
const COMMON = {
  mainSection: 3, mainLoad: 0x40000400, isa: 'coldfire' as const, hmacKeyFrom: null, container: 'ele3' as const,
  versionLen: 4, versionAt: 0x14, versionOptional: false, protected: [], relocatable: [], blobMax: null, sramCode: [0, 0] as Range,
  coreDdr: [] as [string, Range][], slotClaims: [] as [string, number, number, string][], fastTable: '',
  imageFree: [], reserve: null, dspPayloads: {}, dspAreas: [], trailer: null,
}

const upgradeOverMidi = (menu: string, din: string) => `hold FUNC while powering on for the ${menu}, press TRIG 4 (OS UPGRADE), then send the stock .syx over ${din} (not USB)`

export const DIGITAKT_MK1: Device = {
  ...COMMON,
  key: 'digitakt-mk1', name: 'Digitakt mk1', sysexId: 0x0a,
  releases: [
    release('1.53', '9bdd44bb6102fb25c143cfab97bc92b7a89c463f795d3112dce89771e29bcc92', '4b47a9507758ca5669ca02ab2c0374d2c04c98aece445408295cc1dcb265c5df', 2475584),
    release('1.54', 'f78ba80fa7b1da5fb0e1ff61ad61e9e71aafe79f4364fc49679f3651353e3cf6', '5c58bf9e3949ef09977c5fc007a61e8d026931f67f1621238379dfb8ee4d31a2', 2479680),
  ],
  stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x380000,
  areas: { ddr: [0x47be0000, 0x47c00000], 'sram-tail': [0x8000f700, 0x80010000], 'sram-block': [0x80003360, 0x80008000] },
  ddr: [0x47be0000, 0x47c00000], sramCode: [0x8000f700, 0x80010000], fastTable: 'fa_copies',
  coreDdr: [['4.0', [0x47bc0000, 0x47c00000]]], // 256 KB from core 4.0
  recovery: 'hold FUNC while powering on for the startup menu, then send the stock .syx',
}

export const DIGITAKT_MK2: Device = {
  ...COMMON,
  key: 'digitakt-mk2', name: 'Digitakt II', sysexId: 0x14,
  releases: [
    release('1.17', '26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5', 'a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964', 3275616),
  ],
  stage: 0x40400000, flashAt: 0x80000, flashLimit: 0x380000, trailer: 'hmac', hmacKeyFrom: [2, 'Master Overdrive'],
  areas: { ddr: [0x47f00000, 0x47f40000], 'sram-tail': [0x8000f100, 0x80010000], 'sram-block': [0x80006e80, 0x80008000] },
  ddr: [0x47f00000, 0x47f40000], sramCode: [0x8000f100, 0x80010000], fastTable: 'core_fast',
  recovery: upgradeOverMidi('STARTUP menu', 'MIDI'),
}

export const DIGITONE_MK1: Device = {
  ...COMMON,
  key: 'digitone-mk1', name: 'Digitone mk1', sysexId: 0x0d,
  releases: [
    release('1.43', 'c5a54cc05b921f2e4bd814834c5365c2a5aa01d7772a9a2961fac1c3095bf9aa', '3831a477a2a22befb23c42e47e782853da49566ef5d0a1767fcf6c30e6767414', 2732208),
    release('1.44', 'd4f200d04484333d82822db7744e6484d0def8f2db8ddf55ee2b780cc13c9659', 'fce648a97c6c5d93b961732e8f8db6b02e0820c6d344c7e2131fa05a4b3168e4', 2736304),
  ],
  stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x380000,
  areas: { ddr: [0x47be0000, 0x47c00000], bulk: [0x44000000, 0x47be0000] },
  ddr: [0x47be0000, 0x47c00000],
  coreDdr: [['4.0', [0x43ec0000, 0x44000000]]], // 1.25 MB from core 4.0
  slotClaims: [['core_params', 8, 79, 'soundslot']], // a parameter slot's descriptor names its sound slot at +8
  recovery: 'hold FUNC while powering on for the startup menu, press TRIG 4 (OS UPGRADE), then send the stock .syx',
}

export const OCTATRACK: Device = {
  ...COMMON,
  key: 'octatrack', name: 'Octatrack', sysexId: 0x05,
  releases: [
    release('1.40C', '0a8d2d2b35c2cc78fa338576adc1af0cbc094cef973255103165c73edd87f2b6', '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e', 1112560,
      '34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad'),
  ],
  stage: null, flashAt: 0x4000, flashLimit: 0x200000, container: 'elek', versionLen: 10,
  protected: [[0x400de1e0, 0x400e21e0, 'the copy of the bootloader the OS can re-flash it from']],
  relocatable: [[0x400e2000, 18, [0x4001d82e], 'the USB device descriptor']],
  areas: { ddr: [0x40a955e0, 0x41495de0] },
  ddr: [0x40a955e0, 0x41495de0],
  imageFree: [[0x400c45b0, 0x400c4702], [0x400d24d0, 0x400d2ce0], [0x400d64e0, 0x400d7c3c]],
  reserve: [6144, { arena_base: [0x40a955e0, 6144], __arena_pages: [14602, -1], __arena_fill: [14603, -1], __arena_clear: [0x05590800, -6144] }],
  dspPayloads: { A: [0x400e2324, 0x136cb], B: [0x400f59ef, 0x12d05] },
  dspAreas: [['A', 0xaa8, 0xbad, 'dsp:harvest:SPATIALIZER', "SPATIALIZER's code on payload A (core 0)"]],
  recovery: 'hold FUNC while powering on for the startup menu, press TRIG 3 (MIDI UPGRADE) and send the stock .syx over 5-pin MIDI (not USB)',
}

export const MODEL_CYCLES: Device = {
  ...COMMON,
  key: 'model-cycles', name: 'Model:Cycles', sysexId: 0x11,
  releases: [
    release('1.13', '44fe586269631a0ca7da25a3383fc6733c314809505fc3cc52f1e0ed9800640c', 'cc99d4f0175d34d1e91d046e6ec85a5e8ab58ab9edbb3c24406acd48cb99ee98', 1744192),
  ],
  stage: 0x40200000, flashAt: 0x20000, flashLimit: 0x1e0000, trailer: 'hmac', hmacKeyFrom: [2, 'REVERB SEND'],
  versionAt: 0x0c, versionOptional: true,
  areas: { ddr: [0x47e00000, 0x47e40000], 'sram-tail': [0x8000f700, 0x80010000], 'sram-chord-a': [0x80001c5c, 0x800074b4], 'sram-chord-b': [0x8000cac0, 0x8000eae0] },
  ddr: [0x47e00000, 0x47e40000],
  recovery: upgradeOverMidi('STARTUP MENU', '5-pin MIDI'),
}

export const MODEL_SAMPLES: Device = {
  ...MODEL_CYCLES,
  key: 'model-samples', name: 'Model:Samples', sysexId: 0x0f,
  releases: [
    release('1.13', 'e11859b68deb7e5e3fe86ab32581212093849c4be5d3950add011eac398a2ce8', 'a351392c62ec1c6c3324a807baf46934690d54edfc76029a4b4882541cad1ab2', 1733184),
  ],
  hmacKeyFrom: [2, 'DELAY TIME'],
  areas: { ddr: [0x47e00000, 0x47e40000], 'sram-tail': [0x8000f700, 0x80010000] },
}

export const ANALOG_RYTM_MK2: Device = {
  ...COMMON,
  key: 'analog-rytm-mk2', name: 'Analog Rytm MKII', sysexId: 0x0c,
  releases: [
    release('1.73', '8ad671087ec30433d5407c7380d2396e0915ab931c5d3dd18a78bf284d3d1e52', '28d9ef40c895e03f17dfce096543109adaf708947392db72818fc2a412d685d6', 3005432),
    release('1.74', 'cb0f99d620edde994fb860c0e79cc2464e427d06882828cfdfb00fc53700e123', '34cd0c4da8e4b810d1b25284475a99ea53821e2ab7d30a978bf15dc578251f3b', 3005432),
  ],
  stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x300000,
  areas: { ddr: [0x47be0000, 0x47c00000] },
  ddr: [0x47be0000, 0x47c00000],
  recovery: upgradeOverMidi('STARTUP menu', 'MIDI DIN'),
}

export const ANALOG_FOUR_MK2: Device = {
  ...COMMON,
  key: 'analog-four-mk2', name: 'Analog Four MKII', sysexId: 0x0b,
  releases: [
    release('1.56', '5aea489db3e747547f71d5e08a2d20253149fe6258defad60306402d2fc23cb5', '748fec15ddc61bc3ff66047facba74328934c5fb59f427ddaf34a4e2629a474c', 2500408),
  ],
  stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x300000,
  areas: { ddr: [0x47be0000, 0x47c00000] },
  ddr: [0x47be0000, 0x47c00000],
  recovery: upgradeOverMidi('STARTUP menu', 'MIDI DIN'),
}

/** Every known machine. Callers may add a profile (carried-devices.ts does), so this is the one shared list. */
const DEVICES: Device[] = [DIGITAKT_MK1, DIGITAKT_MK2, DIGITONE_MK1, OCTATRACK, MODEL_CYCLES, MODEL_SAMPLES, ANALOG_RYTM_MK2, ANALOG_FOUR_MK2]

export const devices = (): Device[] => DEVICES

/** Where the version field of an 'ele3' file with this device byte is. */
export const versionAt = (sysexId: number): number => DEVICES.find(d => d.container === 'ele3' && d.sysexId === sysexId)?.versionAt ?? 0x14

/** The release of `d` a stock file (or card file) hash or a main OS hash names, or null. */
export function releaseFor(d: Device, syxSha256?: string, mainSha256?: string): Release | null {
  return d.releases.find(r => (syxSha256 && (syxSha256 === r.syxSha256 || syxSha256 === r.binSha256)) || (mainSha256 && r.mainSha256 === mainSha256)) ?? null
}

/** Whether linkable modules (a core, the linker's areas) exist for it. */
export const linkable = (d: Device): boolean => d.ddr[1] > d.ddr[0]

/** Where an appended blob loads: the stock main OS's end. */
export const imageEnd = (d: Device, r: Release): number => d.mainLoad + r.mainLen

export const supported = (): string => DEVICES.flatMap(d => d.releases.map(r => `${d.name} ${r.version}`)).join(', ')

/** The machine and release of a stock file, by its hash. */
export function identify(syxSha256: string): [Device, Release] {
  for (const d of DEVICES) {
    const r = releaseFor(d, syxSha256)
    if (r) return [d, r]
  }
  throw new UnknownFirmware(`not a stock firmware this builder knows (sha256 ${syxSha256}). Supported: ${supported()}`)
}

/** The machine and release a module file's "target" names. */
export function forTarget(target: unknown): [Device, Release] {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new UnknownFirmware('no target')
  const t = target as Record<string, unknown>
  for (const d of DEVICES) {
    if (t.device && d.key !== t.device) continue
    const r = releaseFor(d, typeof t.syx_sha256 === 'string' ? t.syx_sha256 : undefined)
    const main = 'section3_sha256' in t ? t.section3_sha256 : r?.mainSha256
    const length = 'section3_len' in t ? t.section3_len : r?.mainLen
    if (r && main === r.mainSha256 && length === r.mainLen) return [d, r]
  }
  const shown = (x: unknown) => (x === undefined ? '?' : str(x))
  throw new UnknownFirmware(`made for a firmware this builder does not know (${shown(t.product)} ${shown(t.os)})`)
}

/** The "target" a module file for this release carries. */
export const targetOf = (d: Device, r: Release) => ({
  device: d.key, product: d.name, os: r.version, syx_sha256: r.syxSha256, section3_sha256: r.mainSha256, section3_len: r.mainLen,
})
