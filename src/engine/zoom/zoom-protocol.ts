// The Zoom MultiStomp's MIDI file commands (normal mode), as proven on the MS-70CDR 2.10 by the
// ZoomMultistompZDL project (docs/EFFECT-INSTALL-PROTOCOL.md there; docs/ZOOM_MULTISTOMP.md here).
// Pure functions only: the messages to send and how to read the replies. ZoomLink does the talking.
import { CLASHING_EFFECT_IDS, LOCAL_IDS } from '../../catalog/zoom-effect-ids.ts'

/** Device ids the pedals answer with in their identity reply. */
export const ZOOM_MODELS: Record<number, string> = { 0x61: 'MS-70CDR', 0x58: 'MS-50G', 0x5f: 'MS-60B' }
/** The pedals' device ids, by Modwerk machine id. */
export const ZOOM_DEVICE_IDS: Record<string, number> = { 'zoom-ms-70cdr': 0x61, 'zoom-ms-50g': 0x58, 'zoom-ms-60b': 0x5f }

/** Universal identity request. */
export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]

/** `midistomp`: what the base said to the hello, when it answered one. */
export type ZoomIdentity = { deviceId: number; model: string; firmware: string; midistomp?: MidistompHello }

/** The pedal's identity reply: F0 7E ch 06 02 52 <device id> 00 00 00 <four firmware characters> F7. */
export function parseIdentity(m: number[]): ZoomIdentity | undefined {
  if (m.length < 8 || m[0] !== 0xf0 || m[1] !== 0x7e || m[3] !== 0x06 || m[4] !== 0x02 || m[5] !== 0x52) return undefined
  const deviceId = m[6]
  const firmware = m.length >= 14 ? String.fromCharCode(...m.slice(10, 14)).replace(/[^ -~]/g, '').trim() : ''
  return { deviceId, model: ZOOM_MODELS[deviceId] ?? 'Zoom 0x' + deviceId.toString(16), firmware }
}

/** A Zoom SysEx message for one pedal: F0 52 00 <device id> body F7. */
export const zoomSysex = (deviceId: number, body: number[]) => [0xf0, 0x52, 0x00, deviceId, ...body, 0xf7]
/** Whether a message is a reply to a file command (F0 52 00 <id> 60 …). */
export const isFileReply = (m: number[], deviceId: number) => m[1] === 0x52 && m[3] === deviceId && m[4] === 0x60

const fileName = (name: string) => [...Array.from(name, c => c.charCodeAt(0)), 0]

/** 8 bytes into 7-bit MIDI data: each group of up to 7 bytes is led by their high bits, first byte's highest. */
export function pack7(bytes: ArrayLike<number>): number[] {
  const out: number[] = [], all = Array.from(bytes)
  for (let i = 0; i < all.length; i += 7) {
    const group = all.slice(i, i + 7)
    let high = 0
    group.forEach((b, j) => { if (b & 0x80) high |= 1 << (6 - j) })
    out.push(high, ...group.map(b => b & 0x7f))
  }
  return out
}
export function unpack7(bytes: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 8) for (let j = 1; j < 8 && i + j < bytes.length; j++) out.push(bytes[i + j] | (bytes[i] & (1 << (7 - j)) ? 0x80 : 0))
  return out
}
/** Current edit buffer on the original MS-70CDR. The query alone leaves the active patch in place. */
export const CURRENT_PATCH = { request: 0x29, reply: 0x28, edit: 0x50 } as const
export const isCurrentPatchReply = (m: number[], deviceId: number) =>
  deviceId === ZOOM_DEVICE_IDS['zoom-ms-70cdr'] && m.length === 146 &&
  m[0] === 0xf0 && m[1] === 0x52 && m[2] === 0 && m[3] === deviceId && m[4] === CURRENT_PATCH.reply &&
  m[145] === 0xf7

export type ZoomPatchSlot = { index: number; gid: number; fxid: number; enabled: boolean; values: number[] }
export type ZoomCurrentPatch = { name: string; slots: ZoomPatchSlot[] }
/** A staged edit: one knob, a slot on or off, the patch's name, or a slot's effect (`gid`/`fxid` 0 empties it) with
 * its knobs' starting values. */
export type ZoomPatchChange = { slot: number; parameter: number; value: number } | { slot: number; enabled: boolean } | { name: string } |
  { slot: number; gid: number; fxid: number; values: readonly number[] }

/** The MS-70CDR keeps 50 patches; a program change (C0 <program>) loads one into the edit buffer. */
export const PATCH_PROGRAMS = 50
export const PATCH_NAME_LENGTH = 10
export const PATCH_SLOTS = 6
/** Patch commands beyond the edit buffer, as the ZoomMultistompZDL patch editor sends them (MIT): store the edit
 * buffer into a program (a flash write), and turn one knob live (field 2-10 are the nine parameters, 14 bits). */
export const PATCH_COMMANDS = {
  store: (program: number) => [0x32, 0x01, 0x00, 0x00, program & 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00],
  knob: (slot: number, parameter: number, value: number) => [0x31, slot, parameter + 2, value & 0x7f, (value >> 7) & 0x7f],
}
/** How many slots take a live knob message (31): the first three on Zoom's firmware, all six from MIDISTOMP 2.0.4
 * (identity `M204`, matujuice/zoom-ms-midistomp#77). The other slots take Apply. */
export function liveSlots(firmware: string | undefined) {
  const tag = /^M(\d{3})$/.exec((firmware ?? '').trim())
  return tag && +tag[1] >= 204 ? PATCH_SLOTS : 3
}
/** Where patches may be changed: where effect files may be written (canWriteFiles), and MIDISTOMP 2.0.4 or later,
 * whose live knobs reach every slot. */
export const canEditPatches = (identity?: ZoomIdentity) => canWriteFiles(identity) ||
  (identity?.deviceId === ZOOM_DEVICE_IDS['zoom-ms-70cdr'] && liveSlots(identity.firmware) === PATCH_SLOTS)
/** A name the pedal can show: printable 7-bit characters, at most ten. */
export const cleanPatchName = (name: string) => name.replace(/[^\x20-\x7e]/g, '').slice(0, PATCH_NAME_LENGTH).trimEnd()

// Unpacking the SysEx collectors leaves the same little-endian bit fields in each 18-byte slot.
const PATCH_CONTROLS = [[29, 12], [42, 11], [55, 11], [68, 8], [76, 8], [84, 8], [92, 8], [100, 9], [128, 8]]
const PATCH_NAME_AT = 111, PATCH_COUNT_AT = 109

export function zoomPatchParameterMax(slot: number, parameter: number): number {
  // The high bit of the ninth knob in slot 5 is unverified. Preserve it.
  const width = slot === 4 && parameter === 8 ? 7 : PATCH_CONTROLS[parameter]?.[1] ?? 0
  return (1 << width) - 1
}

/** Overlay changed fields on a fresh reply, preserving the IDs, the name and unmodelled bytes unless changed. Effect
 * changes go first (they decide which slots exist and set their knobs), then knobs and on/off on top. */
export function editCurrentPatch(message: number[], changes: readonly ZoomPatchChange[]): number[] {
  const patch = parseCurrentPatch(message)
  if (!patch) throw new Error('The pedal did not return its active patch.')
  const raw = unpack7(message.slice(5, -1)), slots = new Set(patch.slots.map(slot => slot.index))
  const write = (slot: number, bit: number, max: number, value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > max) throw new Error('The parameter value does not fit this patch slot.')
    const at = slot * 18 + (bit >> 3), shift = bit & 7, mask = max << shift
    const current = raw[at] | raw[at + 1] << 8 | raw[at + 2] << 16
    const updated = (current & ~mask) | (value << shift)
    raw[at] = updated & 255
    raw[at + 1] = (updated >> 8) & 255
    raw[at + 2] = (updated >> 16) & 255
  }
  for (const change of [...changes.filter(c => 'gid' in c), ...changes.filter(c => !('gid' in c))]) {
    if ('name' in change) {
      const name = cleanPatchName(change.name).padEnd(PATCH_NAME_LENGTH)
      for (let i = 0; i < PATCH_NAME_LENGTH; i++) raw[PATCH_NAME_AT + i] = name.charCodeAt(i)
      continue
    }
    if (!Number.isInteger(change.slot) || change.slot < 0 || change.slot >= PATCH_SLOTS) throw new Error('There is no such slot in a patch.')
    if ('gid' in change) {
      const used = !!(change.gid || change.fxid)
      write(change.slot, 25, 15, change.gid)
      write(change.slot, 1, 1023, change.fxid)
      write(change.slot, 0, 1, Number(used))
      PATCH_CONTROLS.forEach(([bit], parameter) => write(change.slot, bit, zoomPatchParameterMax(change.slot, parameter), used ? change.values[parameter] ?? 0 : 0))
      // The slot count only grows, to cover a slot given an effect: lowering it would drop the slots past it.
      const count = (raw[PATCH_COUNT_AT] >> 2) & 7
      if (used && change.slot >= count) raw[PATCH_COUNT_AT] = (raw[PATCH_COUNT_AT] & ~0x1c) | ((change.slot + 1) << 2)
      if (used) slots.add(change.slot)
      else slots.delete(change.slot)
      continue
    }
    if (!slots.has(change.slot)) throw new Error('The effect slot is no longer in the active patch.')
    if ('parameter' in change && !PATCH_CONTROLS[change.parameter]) throw new Error('The parameter value does not fit this patch slot.')
    if ('parameter' in change) write(change.slot, PATCH_CONTROLS[change.parameter][0], zoomPatchParameterMax(change.slot, change.parameter), change.value)
    else write(change.slot, 0, 1, Number(change.enabled))
  }
  return [...message.slice(0, 5), ...pack7(raw), 0xf7]
}

export function parseCurrentPatch(m: number[]): ZoomCurrentPatch | undefined {
  if (!isCurrentPatchReply(m, ZOOM_DEVICE_IDS['zoom-ms-70cdr']) || m.slice(5, -1).some(byte => byte < 0 || byte > 127)) return undefined
  const raw = unpack7(m.slice(5, -1))
  const name = String.fromCharCode(...raw.slice(111, 121)).replace(/[^ -~]/g, ' ').trimEnd()
  const count = (raw[109] >> 2) & 7
  if (count > 6) return undefined
  const slots: ZoomPatchSlot[] = []
  for (let index = 0; index < count; index++) {
    const read = (at: number, width: number) => {
      const byte = 18 * index + (at >> 3)
      return ((raw[byte] | raw[byte + 1] << 8 | raw[byte + 2] << 16) >>> (at & 7)) & ((1 << width) - 1)
    }
    const gid = read(25, 4), fxid = read(1, 10)
    if (!gid && !fxid) continue
    slots.push({ index, gid, fxid, enabled: !!read(0, 1), values: PATCH_CONTROLS.map(([offset, width]) => read(offset, width)) })
  }
  return { name, slots }
}

export function crc32(bytes: ArrayLike<number>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1 }
  return (c ^ 0xffffffff) >>> 0
}

/** File command bodies (without the F0 52 00 <id> header). */
export const FILE = {
  listFirst: () => [0x60, 0x25, 0, 0, ...fileName('*')],
  listNext: () => [0x60, 0x26, 0, 0, ...fileName('*')],
  close: [[0x60, 0x21, 0x40, 0, 0, 0, 0], [0x60, 0x09]],
  readOpen: (name: string) => [0x60, 0x20, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...fileName(name)],
  /** One block: the data comes in the reply to the third message. */
  readBlock: [[0x60, 0x05, 0], [0x60, 0x22, 0x14, 0x2f, 0x60, 0, 0x0c, 0, 0x04, 0, 0, 0], [0x60, 0x05, 0]],
  usage: () => [0x60, 0x29, 0, 0, 0, 0, 0],
  /** Before writing: check the name, then delete any old file of that name and open it for writing. */
  writeOpen: (name: string) => [[0x60, 0x25, 0, 0, ...fileName(name)], [0x60, 0x05, 0], [0x60, 0x27], [0x60, 0x24, ...fileName(name)], [0x60, 0x20, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...fileName(name)], [0x60, 0x05, 0]],
  /** One block of up to 512 bytes, packed, with its checksum (sent as crc ^ 0xffffffff in 7-bit groups). */
  writeBlock: (part: ArrayLike<number>) => {
    const crc = (crc32(part) ^ 0xffffffff) >>> 0
    return [0x60, 0x23, 0x40, 0, 0, 0, 0, part.length & 0x7f, (part.length >> 7) & 0x7f, 0, 0, 0, ...pack7(part), crc & 0x7f, (crc >>> 7) & 0x7f, (crc >>> 14) & 0x7f, (crc >>> 21) & 0x7f, (crc >>> 28) & 0x0f]
  },
  remove: (name: string) => [[0x60, 0x25, 0, 0, ...fileName(name)], [0x60, 0x05, 0], [0x60, 0x27], [0x60, 0x24, ...fileName(name)]],
}
export const WRITE_BLOCK = 512

const ok = (m: number[] | null | undefined): m is number[] => !!m && m[4] === 0x60 && m[5] === 0x04
const size35 = (d: number[], at: number) => d[at] + d[at + 1] * 128 + d[at + 2] * 16384 + d[at + 3] * 2097152 + d[at + 4] * 268435456

/** One file from a list reply, or undefined at the end of the list. Names are at most 12 characters (8.3). */
export function parseListEntry(m: number[] | null): { name: string; size: number } | undefined {
  if (!ok(m)) return undefined
  const d = m.slice(1), end = d.indexOf(0, 14)
  const name = String.fromCharCode(...d.slice(14, end > 14 && end < 26 ? end : 26))
  return name ? { name, size: size35(d, 29) } : undefined
}

/** A read block: its bytes and whether their checksum matched, or the end of the file. */
export function parseBlock(m: number[] | null): { end: true } | { end: false; data: number[]; ok: boolean } {
  const d = m ? m.slice(1, -1) : []
  if (d[3] !== 0x60 || d[4] !== 0x04 || d[5] !== 0x22 || d.length < 15) return { end: true }
  const length = d[8] + d[9] * 128
  if (!length) return { end: true }
  const data = unpack7(d.slice(10, 10 + length + Math.floor(length / 7) + 1)).slice(0, length)
  const t = d.slice(-5), crc = (t[0] + (t[1] << 7) + (t[2] << 14) + (t[3] << 21) + ((t[4] & 0x0f) << 28)) >>> 0
  return { end: false, data, ok: ((crc ^ 0xffffffff) >>> 0) === crc32(data) }
}

/** Free space on the pedal, in bytes, from the usage reply. */
export function parseUsage(m: number[] | null): number | undefined {
  if (!ok(m)) return undefined
  return size35(m.slice(1), 15)
}

/** An effect file's header: its group, effect id and version (Zoom's 76-byte header before the ELF). */
export function effectInfo(b: ArrayLike<number>): { gid: number; fxid: number; version: string } | undefined {
  if (b.length < 0x50 || String.fromCharCode(b[4], b[5], b[6], b[7]) !== 'SIZE' || b[0x4c] !== 0x7f || String.fromCharCode(b[0x4d], b[0x4e], b[0x4f]) !== 'ELF') return undefined
  return { gid: b[0x3c], fxid: b[0x40] | (b[0x41] << 8), version: String.fromCharCode(b[0x44], b[0x45], b[0x46], b[0x47]) }
}

/** The effect list (FLST_SEQ.ZDT, 4108 bytes): per group, '>>>' 00 <group> and 8 zero bytes, then 13-byte
 * records (the file name padded to 12, then 00), then '<<<' 00 <group> and 8 zero bytes; zero padding at the end. */
export const EFFECT_LIST = 'FLST_SEQ.ZDT', EFFECT_LIST_SIZE = 4108
const isMark = (list: ArrayLike<number>, at: number, mark: number) => list[at] === mark && list[at + 1] === mark && list[at + 2] === mark && list[at + 3] === 0
const recordName = (list: ArrayLike<number>, at: number) => String.fromCharCode(...Array.from(list).slice(at, at + 12)).replace(/\0+$/, '')

/** Every record in the list, with its offset and its group. */
export function listRecords(list: ArrayLike<number>): { at: number; gid: number; name: string }[] {
  const out: { at: number; gid: number; name: string }[] = []
  for (let at = 0; at + 13 <= list.length;) {
    if (!isMark(list, at, 0x3e)) { at++; continue }
    const gid = list[at + 4]
    let r = at + 13
    for (; r + 13 <= list.length && !isMark(list, r, 0x3c); r += 13) out.push({ at: r, gid, name: recordName(list, r) })
    at = r + 13
  }
  return out
}
/** The list with `name` added at the end of its group's section; one zero record comes off the padding. */
export function listWith(list: number[], gid: number, name: string): number[] {
  let start = -1
  for (let at = 0; at + 4 < list.length; at++) if (isMark(list, at, 0x3e) && list[at + 4] === gid) { start = at; break }
  if (start < 0) throw new Error('The effect list has no section for group ' + gid + '.')
  let end = start + 13
  while (end + 3 < list.length && !isMark(list, end, 0x3c)) end += 13
  if (list.slice(-13).some(b => b)) throw new Error('The effect list is full.')
  return [...list.slice(0, end), ...Array.from(name, c => c.charCodeAt(0)), ...Array(13 - name.length).fill(0), ...list.slice(end, list.length - 13)]
}
/** The list without `name`, or undefined when it isn't there; zero padding goes back on the end. */
export function listWithout(list: number[], name: string): number[] | undefined {
  const record = listRecords(list).find(r => r.name.toUpperCase() === name.toUpperCase())
  return record ? [...list.slice(0, record.at), ...list.slice(record.at + 13), ...Array(13).fill(0)] : undefined
}
/** A name the pedal accepts: at most 8 letters, digits or underscores, then .ZDL (it shortens longer ones, and two that shorten alike freeze it). */
export const validEffectName = (name: string) => /^[A-Z0-9_]{1,8}\.ZDL$/.test(name)

/** Effects this page may install or remove: added ones (group 8, IDs 403-1023; a patch stores 10 bits of ID, and an
 * MS-70CDR 2.10 ran, saved and recalled effects at 917, 1000 and 1023). Zoom's own effects are never offered for removal. */
export const isAddedEffect = (effect?: { gid: number; fxid: number }) => !!effect && effect.gid === 8 && effect.fxid >= 403 && effect.fxid <= 1023

export { CLASHING_EFFECT_IDS, LOCAL_IDS }
export const isLocalId = (effect?: { gid: number; fxid: number }) => !!effect && effect.gid === LOCAL_IDS.gid && effect.fxid >= LOCAL_IDS.first && effect.fxid <= LOCAL_IDS.last

/** The effect file with its ID changed; nothing else in it. */
export function withEffectId(data: ArrayLike<number>, fxid: number): number[] {
  const out = Array.from(data)
  out[0x40] = fxid & 0xff
  out[0x41] = fxid >> 8
  return out
}

/** A free local ID for `name`: the same one for the same file name wherever there's room, so a patch made on one
 * pedal finds the effect on another, then the next free one. `taken` is every ID in use on the pedal, `avoid` the ones
 * this browser has given other effects before (a stored patch may still point at one). */
export function localIdFor(name: string, taken: Set<number>, avoid: Set<number> = new Set()): number | undefined {
  const size = LOCAL_IDS.last - LOCAL_IDS.first + 1
  let hash = 0
  for (const c of name.toUpperCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  for (let i = 0; i < size; i++) {
    const fxid = LOCAL_IDS.first + (hash + i) % size
    if (!taken.has(fxid) && !avoid.has(fxid)) return fxid
  }
  return undefined
}


/** Why an effect file can't be installed, or undefined when it can: the name, an effect header, an added effect, no known clash. */
export function installRefusal(name: string, data: ArrayLike<number>): string | undefined {
  const info = effectInfo(data), id = info && info.gid + '/' + info.fxid
  if (!validEffectName(name.toUpperCase())) return name + ': the pedal needs a name of at most 8 letters, digits or underscores, then .ZDL.'
  if (!info) return name + ' is not an effect file.'
  if (!isAddedEffect(info)) return name + ' has effect ID ' + id + ': only added effects (group 8, IDs 403 to 1023) are installed. Zoom’s own effects stay as they are.'
  const clash = CLASHING_EFFECT_IDS.find(c => c.gid === info.gid && c.fxid === info.fxid)
  if (clash) return name + ' uses effect ID ' + id + ', which older builds of ' + clash.files + ' both used. Swapping one for the other has frozen a pedal at boot, so it isn’t installed. ' + clash.moved + ': get the current file.'
}

/** The base the pedal page installs on an MS-70CDR, and the version its identity reply gives then (MIDISTOMP's
 * identity-tag patch). Kept here so pages don't load MIDISTOMP's patches (277 KB); zoom-base.test.ts checks they agree. */
export const ZOOM_BASE = { name: 'MIDISTOMP V2.0.1', tag: 'M201' } as const

/** MIDISTOMP's own SysEx, on the non-commercial id 7D so Zoom's parser drops it (stock firmware never answers):
 * F0 7D 'M' 'S' 'T' <command> <nonce> … F7; replies are numbered from 41 in the order the commands came, with the
 * request's nonce (MIDISTOMP PR #64, its docs/dev/modwerk-research.md section 1). Hello 01 answers 41 (major, minor,
 * patch) and 42 (feature bits, 7 a byte); 02 to 05 (MIXER and PERFORM entries, 43 to 46) aren't used here; load 06 answers 47. */
export const MST = { hello: 0x01, version: 0x41, features: 0x42, load: 0x06, loadReply: 0x47 } as const
export const mstSysex = (command: number, nonce: number, args: number[] = []) => [0xf0, 0x7d, 0x4d, 0x53, 0x54, command, nonce & 0x7f, ...args, 0xf7]
export const isMstReply = (m: number[]) => m[1] === 0x7d && m[2] === 0x4d && m[3] === 0x53 && m[4] === 0x54
/** The hello's feature bits, low bit first. */
export const MIDISTOMP_FEATURES = ['MIDI CC', 'MIDI clock and transport', 'MIDI settings', 'Tempo hold', 'Looper services', 'Mixer', 'PERFORM', 'MASTER', 'KALEIDO', 'SYSTEM meters', 'DSP limit 300']
export type MidistompHello = { version: string; features: string[] }
export function parseHello(version: number[], status: number[]): MidistompHello {
  const bits = status[7] | status[8] << 7 | status[9] << 14
  return { version: version.slice(7, 10).join('.'), features: MIDISTOMP_FEATURES.filter((_, bit) => bits & 1 << bit) }
}
/** One window (0.74 s) of the SYSTEM screen's numbers: CPU parts in tenths of a percent of an audio block, DSP in
 * tenths of the effects' declared units (limit 300), late = blocks that started late, the CPU being full. */
export type MidistompLoad = {
  window: number; cpu: number; audio: number; audioMax: number; perform: number; midi: number; system: number; late: number; lateTotal: number; dsp: number
  slots: { name: string; cpu: number; dsp: number }[]
}
/** Load 06 (built for MIDISTOMP on top of its PR #64, not in a release yet): keeps the SYSTEM screen's timing on for
 * 5 s and answers 47 <nonce> + 120 bytes packed 8-into-7: the window's 14 words as diag.c keeps them (per, ch, chmax,
 * own, cyc[7], late, win, midi; cycles of a block), then late total, all 32-bit; each slot's DSP in tenths (16-bit);
 * each slot's name in 8 bytes, ended by a 0 when shorter ('-' empty, '?' loading). Cycles become tenths of a percent
 * as its pc() does: an 8-frame block at 300 MHz is 54,422 cycles. */
export function parseLoad(m: number[]): MidistompLoad | undefined {
  if (!isMstReply(m) || m[5] !== MST.loadReply || m.length !== 146) return undefined
  const b = unpack7(m.slice(7, -1)), word = (k: number) => (b[4 * k] | b[4 * k + 1] << 8 | b[4 * k + 2] << 16 | b[4 * k + 3] << 24) >>> 0
  const tenths = (k: number) => Math.round(word(k) * 1000 / 54422)
  const slots = Array.from({ length: 6 }, (_, s) => ({ name: String.fromCharCode(...b.slice(72 + 8 * s, 80 + 8 * s)).replace(/\0[^]*$/, ''), cpu: tenths(5 + s), dsp: b[60 + 2 * s] | b[61 + 2 * s] << 8 }))
  return { window: word(12), cpu: tenths(0), audio: tenths(1), audioMax: tenths(2), system: tenths(3), perform: tenths(4), late: word(11), midi: tenths(13), lateTotal: word(14), dsp: slots.reduce((sum, slot) => sum + slot.dsp, 0), slots }
}

/** Update mode (hold Up and Down while plugging in USB): the bootloader answers the identity request with version 1.1x
 * and the model byte from the pedal's flash, and takes the flash commands below. Seen on the MS-70CDR and on an MS-50G
 * (23 November 2026: 0x58, 1.10, recorded while Effect Manager 2.3.3 wrote its effects). */
const UPDATE_MODE_SEEN = [ZOOM_DEVICE_IDS['zoom-ms-70cdr'], ZOOM_DEVICE_IDS['zoom-ms-50g']]
export const isUpdateMode = (identity?: ZoomIdentity) => !!identity && UPDATE_MODE_SEEN.includes(identity.deviceId) && identity.firmware.startsWith('1.1')
/** Where the base may be flashed: an MS-70CDR in update mode. The base is built from the MS-70CDR's OS, and the
 * modding guidelines allow no firmware flips, so another pedal in update mode is refused. */
export const canFlashBase = (identity?: ZoomIdentity) => isUpdateMode(identity) && identity!.deviceId === ZOOM_DEVICE_IDS['zoom-ms-70cdr']
/** D004 adds loader diagnostics to M201 and uses the same effect file service. */
export const ZOOM_FILE_WRITE_REQUIREMENT = 'Effect file changes require the MS-70CDR with Zoom 2.10, MIDISTOMP 2.0.1, or development build D004.'
/** Where installing and removing effect files may write: the MS-70CDR on Zoom's 2.10, where they were proven, on the base
 * (Zoom's 2.10, patched), or on development build D004. Every other pedal or firmware is only read. */
export const canWriteFiles = (identity?: ZoomIdentity) => identity?.deviceId === ZOOM_DEVICE_IDS['zoom-ms-70cdr'] &&
  (identity.firmware === '2.10' || identity.firmware === ZOOM_BASE.tag || identity.firmware === 'D004')
/** The bootloader's answer to a flash command: F0 52 00 <id> 00 <status> F7, 00 done, 08 a write's checksum failed. */
export const isFlashReply = (m: number[], deviceId: number) => m.length === 7 && m[1] === 0x52 && m[3] === deviceId && m[4] === 0x00
export const FLASH_OK = 0x00, FLASH_BAD_CRC = 0x08
const n7 = (n: number, groups: number) => Array.from({ length: groups }, (_, i) => Math.floor(n / 128 ** i) & 0x7f)
/** Flash command bodies, numbers in 7-bit groups, least significant first; as recorded from zoomms' MS-70CDR updater. */
export const FLASH = {
  start: [0x01],
  erase: (address: number, length: number) => [0x0a, ...n7(address, 5), ...n7(length, 5)],
  /** One block: address, length, the data packed 8-into-7, CRC32 ^ 0xFFFFFFFF. */
  write: (address: number, block: ArrayLike<number>) => [0x02, ...n7(address, 5), ...n7(block.length, 2), ...pack7(block), ...n7((crc32(block) ^ 0xffffffff) >>> 0, 5)],
  finish: [0x04],
}
export const FLASH_BLOCK = 2048
const OS = { trailer: 0x0ef000, at: 0x040000, length: 0xb0000 }, PRESET = { at: 0x3fd000, length: 0x3000 }

/** The MS-70CDR flash, every message body in order: Zoom's updater script with zoomms' skips (zoomms/macapp.py), so
 * never the bootloader (0x000000) or the effects (0x0F0000). The OS trailer is erased first, so an interrupted flash
 * shows; Preset.bin (the boot logo block) only when the base changes it. */
export function flashSteps(main: Uint8Array, preset?: Uint8Array): number[][] {
  if (main.length !== OS.length) throw new Error('Main.bin must be ' + OS.length + ' bytes, not ' + main.length + '.')
  if (preset && preset.length !== PRESET.length) throw new Error('Preset.bin must be ' + PRESET.length + ' bytes, not ' + preset.length + '.')
  const writes = (at: number, data: Uint8Array) => Array.from({ length: data.length / FLASH_BLOCK }, (_, i) => FLASH.write(at + i * FLASH_BLOCK, data.subarray(i * FLASH_BLOCK, (i + 1) * FLASH_BLOCK)))
  return [
    FLASH.start,
    FLASH.erase(OS.trailer, 0x1000),
    ...preset ? [FLASH.erase(PRESET.at, PRESET.length), ...writes(PRESET.at, preset)] : [],
    FLASH.erase(OS.at, OS.length),
    ...writes(OS.at, main),
    FLASH.finish,
  ]
}
