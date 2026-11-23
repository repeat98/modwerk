// The MS-70CDR's patches over MIDI, as the ZoomMultistompZDL project's patch editor reads and writes them
// (tools/patch_editor.html there, MIT, proven on the MS-70CDR 2.10): the 146-byte patch dump, its fields, and the
// effect knob tables read from an effect file. Pure functions only; ZoomLink does the talking.
//
// A patch dump is F0 52 00 61 28 … F7, 146 bytes in all. Each of its six slots has eleven fields: on/off, the effect
// (a 32-bit patch effect id, patchEffectId) and nine knobs, each spread over several bytes ([byte, mask, shift]; a
// "NZ" entry is a flag set when the field is not zero, which the pedal keeps). The bit tables cover about half the
// dump, so a patch is always written on top of the dump the pedal sent: the bytes nobody has mapped stay as they were.

/** The patch commands (F0 52 00 <id> body F7): editor mode on (the pedal only sends and takes patches in it), send
 * the patch being played, store it into a program (0-49, a flash write), and turn one knob live. */
export const PATCH = {
  editMode: [0x50] as number[],
  read: [0x29] as number[],
  store: (program: number) => [0x32, 0x01, 0x00, 0x00, program & 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00],
  knob: (slot: number, field: number, value: number) => [0x31, slot, field, value & 0x7f, (value >> 7) & 0x7f],
}
export const PATCH_SIZE = 146
export const PATCH_PROGRAMS = 50
export const PATCH_NAME_LENGTH = 10
/** Whether a message is a whole patch dump from this pedal. */
export const isPatchDump = (m: number[], deviceId: number) => m.length === PATCH_SIZE && m[0] === 0xf0 && m[1] === 0x52 && m[3] === deviceId && m[4] === 0x28 && m[PATCH_SIZE - 1] === 0xf7

type Bit = readonly [number, number, number | 'NZ']
// slot -> field (0 on/off, 1 effect id, 2-10 knobs) -> the bits it is made of. Slot 6's last knob is 7 bits only (the
// editor dropped an entry that overlapped its own low bits; 0-127 round-trips, which covers every knob in the pack).
const BITS: readonly (readonly (readonly Bit[])[])[] = [
  [[[6,1,0]],[[5,0x40,24],[6,0x7e,16],[7,0x07,8],[9,0x1f,0]],[[9,0x60,-5],[5,0x8,-1],[10,0x7f,3],[5,0x4,8],[11,0x1,11]],[[11,0x7c,-2],[5,0x2,4],[12,0x1f,6]],[[5,0x1,0],[14,0x7f,1],[13,0x40,2],[15,0x3,9]],[[15,0x70,-4],[13,0x20,-2],[16,0x0f,4]],[[16,0x70,-4],[13,0x10,-1],[17,0x0f,4]],[[17,0x70,-4],[13,0x08,0],[18,0x0f,4]],[[18,0x70,-4],[13,0x04,1],[19,0x0f,4]],[[19,0x70,-4],[13,0x02,2],[20,0x1f,4],[23,0x40,"NZ"]],[[24,0x7f,0],[21,0x10,3]]],
  [[[26,1,0]],[[21,0x4,28],[26,0x7e,16],[27,0x07,8],[30,0x1f,0]],[[30,0x60,-5],[29,0x40,-4],[31,0x7f,3],[29,0x20,5],[32,0x1,11]],[[32,0x7c,-2],[29,0x10,1],[33,0x1f,6]],[[29,0x8,-3],[34,0x7f,1],[29,0x4,6],[35,0x3,9]],[[35,0x70,-4],[29,0x2,2],[36,0x0f,4]],[[36,0x70,-4],[29,0x1,3],[38,0x0f,4]],[[38,0x70,-4],[37,0x40,-3],[39,0x0f,4]],[[39,0x70,-4],[37,0x20,-2],[40,0x0f,4]],[[40,0x70,-4],[37,0x10,-1],[41,0x1f,4],[43,0x40,"NZ"]],[[44,0x7f,0],[37,0x1,7]]],
  [[[47,1,0]],[[45,0x20,25],[47,0x7e,16],[48,0x07,8],[50,0x1f,0]],[[50,0x60,-5],[45,0x4,0],[51,0x7f,3],[45,0x2,9],[52,0x1,11]],[[52,0x7c,-2],[45,0x1,5],[54,0x1f,6]],[[53,0x40,-6],[55,0x7f,1],[53,0x20,3],[56,0x3,9]],[[56,0x70,-4],[53,0x10,-1],[57,0x0f,4]],[[57,0x70,-4],[53,0x8,0],[58,0x0f,4]],[[58,0x70,-4],[53,0x4,1],[59,0x0f,4]],[[59,0x70,-4],[53,0x2,2],[60,0x0f,4]],[[60,0x70,-4],[53,0x1,3],[62,0x1f,4],[64,0x40,"NZ"]],[[65,0x7f,0],[61,0x8,4]]],
  [[[67,1,0]],[[61,0x2,29],[67,0x7e,16],[68,0x07,8],[71,0x1f,0]],[[71,0x60,-5],[69,0x20,-3],[72,0x7f,3],[69,0x10,6],[73,0x1,11]],[[73,0x7c,-2],[69,0x8,2],[74,0x1f,6]],[[69,0x4,-2],[75,0x7f,1],[69,0x2,7],[76,0x3,9]],[[76,0x70,-4],[69,0x1,3],[78,0x0f,4]],[[78,0x70,-4],[77,0x40,-3],[79,0x0f,4]],[[79,0x70,-4],[77,0x20,-2],[80,0x0f,4]],[[80,0x70,-4],[77,0x10,-1],[81,0x0f,4]],[[81,0x70,-4],[77,0x8,0],[82,0x1f,4],[84,0x40,"NZ"]],[[86,0x7f,0],[85,0x40,1]]],
  [[[88,1,0]],[[85,0x10,26],[88,0x7e,16],[89,0x07,8],[91,0x1f,0]],[[91,0x60,-5],[85,0x2,1],[92,0x7f,3],[85,0x1,10],[94,0x1,11]],[[94,0x7c,-2],[93,0x40,-1],[95,0x1f,6]],[[93,0x20,-5],[96,0x7f,1],[93,0x10,4],[97,0x3,9]],[[97,0x70,-4],[93,0x8,0],[98,0x0f,4]],[[98,0x70,-4],[93,0x4,1],[99,0x0f,4]],[[99,0x70,-4],[93,0x2,2],[100,0x0f,4]],[[100,0x70,-4],[93,0x1,3],[102,0x0f,4]],[[102,0x70,-4],[101,0x40,-3],[103,0x1f,4],[105,0x40,"NZ"]],[[106,0x7f,0]]],
  [[[108,1,0]],[[101,0x1,30],[108,0x7e,16],[110,0x07,8],[112,0x1f,0]],[[112,0x60,-5],[109,0x10,-2],[113,0x7f,3],[109,0x8,7],[114,0x1,11]],[[114,0x7c,-2],[109,0x4,3],[115,0x1f,6]],[[109,0x2,-1],[116,0x7f,1],[109,0x1,8],[118,0x3,9]],[[118,0x70,-4],[117,0x40,-3],[119,0x0f,4]],[[119,0x70,-4],[117,0x20,-2],[120,0x0f,4]],[[120,0x70,-4],[117,0x10,-1],[121,0x0f,4]],[[121,0x70,-4],[117,0x8,0],[122,0x0f,4]],[[122,0x70,-4],[117,0x4,1],[123,0x1f,4],[126,0x40,"NZ"]],[[127,0x7f,0],[125,0x20,2]]]
]
const NAME_AT = [132, 134, 135, 136, 137, 138, 139, 140, 142, 143]
const NZ = BITS.flatMap(slot => slot.flatMap(field => field.filter(b => b[2] === 'NZ').map(b => [b[0], b[1]] as const)))

function getBits(d: ArrayLike<number>, bits: readonly Bit[]) {
  let v = 0
  for (const [at, mask, shift] of bits) {
    if (at >= d.length || shift === 'NZ') continue
    const x = d[at] & mask
    v |= shift >= 0 ? x << shift : x >> -shift
  }
  return v >>> 0
}
function setBits(d: number[], bits: readonly Bit[], value: number) {
  for (const [at, mask, shift] of bits) {
    if (at >= d.length) continue
    if (shift === 'NZ') d[at] = (d[at] & ~mask) | (value ? mask : 0)
    else d[at] = (d[at] & ~mask) | ((shift >= 0 ? value >>> shift : value << -shift) & mask)
  }
}

export type PatchSlot = { on: boolean; effect: number; knobs: number[] }
/** `slots`: always six; `count`: how many slots the pedal honours; `current`: the slot its screen shows. */
export type Patch = { name: string; slots: PatchSlot[]; count: number; current: number }

export function decodePatch(d: ArrayLike<number>): Patch {
  const name = NAME_AT.map(i => d[i] >= 0x20 && d[i] <= 0x7e ? String.fromCharCode(d[i]) : ' ').join('').replace(/ +$/, '')
  const slots = BITS.map(fields => {
    const v = fields.map(bits => getBits(d, bits))
    return { on: !!v[0], effect: v[1], knobs: v.slice(2) }
  })
  return { name, slots, count: (d[130] & 0x1c) >> 2, current: 6 - (((d[130] & 1) << 2) + ((d[125] & 8) >> 2) + ((d[129] & 0x40) >> 6)) }
}

/** A patch written on top of the dump the pedal sent (`base`), for this pedal: only the known fields change, and the
 * name's bytes only when the name did. The slot count only goes up (to cover the last slot in use), never below
 * what the pedal said: lowering it drops the slots past it. */
export function encodePatch(p: Patch, base: ArrayLike<number>, deviceId: number): number[] {
  if (base.length !== PATCH_SIZE) throw new Error('A patch is written on top of the one the pedal sent.')
  const d = Array.from(base), was = decodePatch(base)
  d[3] = deviceId
  if (p.name !== was.name) {
    const name = cleanName(p.name).padEnd(PATCH_NAME_LENGTH, ' ')
    NAME_AT.forEach((at, i) => { d[at] = name.charCodeAt(i) & 0x7f })
    d[125] &= ~0x40; d[133] = 0; d[141] &= ~0x03   // the name's high bits, which would garble it
  }
  p.slots.forEach((slot, s) => [slot.on ? 1 : 0, slot.effect, ...slot.knobs].forEach((value, k) => setBits(d, BITS[s][k], value)))
  for (const [at, mask] of NZ) d[at] = (d[at] & ~mask) | (base[at] & mask)
  let last = 5
  while (last > 0 && !p.slots[last].effect) last--
  const count = Math.max(p.slots[last].effect ? last + 1 : 0, was.count)
  if (count) d[130] = (d[130] & ~0x1c) | (Math.min(6, count) << 2)
  const c = Math.max(0, 6 - Math.min(p.current, 6))
  d[129] = (d[129] & ~0x40) | ((c & 1) << 6)
  d[125] = (d[125] & ~0x8) | ((c & 2) << 2)
  d[130] = (d[130] & ~1) | ((c & 4) >> 2)
  return d
}
/** A name the pedal can show: printable 7-bit characters, at most ten. */
export const cleanName = (name: string) => name.replace(/[^\x20-\x7e]/g, '').slice(0, PATCH_NAME_LENGTH).replace(/ +$/, '')

/** The id a patch stores for an effect of group `gid` and effect id `fxid` (checked against all 137 stock MS-70CDR
 * effects by the project's build/extract_effect_db.py). */
export const patchEffectId = (gid: number, fxid: number) => ((((fxid & 0x3f) << 17) | (((fxid >> 6) & 1) << 30) | (((fxid >> 7) & 7) << 8) | (gid << 1)) >>> 0)

export type EffectKnob = { name: string; max: number; default: number }
/** What an effect file says about itself: its name, its knobs (at most nine), its declared DSP cost. */
export type EffectKnobs = { name: string; knobs: EffectKnob[]; cost?: number }

/** Read an effect's knob table from its file: 48-byte entries starting with "OnOff", then the effect's own entry (max
 * 0xFFFFFFFF), then one per knob (name, max at +12, default at +16), the last flagged at +44 bit 2. Found by content,
 * so it works on every effect file, Zoom's and added ones. Undefined when there is none. */
export function effectKnobs(file: ArrayLike<number>): EffectKnobs | undefined {
  const b = file instanceof Uint8Array ? file : Uint8Array.from(file as ArrayLike<number>)
  const u32 = (at: number) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0
  const ONOFF = [0x4f, 0x6e, 0x4f, 0x66, 0x66, 0x00]
  for (let at = 0; at + 0x60 <= b.length; at++) {
    if (!ONOFF.every((c, i) => b[at + i] === c)) continue
    const entries: { name: string; max: number; default: number }[] = []
    let ok = true
    for (let e = at; ; e += 0x30) {
      if (e + 0x30 > b.length || entries.length > 12) { ok = false; break }
      const raw: number[] = []
      for (let i = 0; i < 10 && b[e + i]; i++) raw.push(b[e + i])
      // 0x1F is the pedal font's "Hz" glyph (the graphic EQ's bands).
      if (raw.some(c => (c < 0x20 && c !== 0x1f) || c > 0x7e)) { ok = false; break }
      entries.push({ name: raw.map(c => c === 0x1f ? 'Hz' : String.fromCharCode(c)).join(''), max: u32(e + 0x0c), default: u32(e + 0x10) })
      if (u32(e + 0x2c) & 0x04) break
    }
    if (!ok || entries.length < 2 || entries[1].max !== 0xffffffff) continue
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength), cost = view.getFloat32(at + 0x30 + 0x28, true)
    const knobs = entries.slice(2).filter(k => k.name && k.max !== 0xffffffff).slice(0, 9)
    return { name: entries[1].name, knobs, ...(cost > 0 && cost < 1000 ? { cost: Math.round(cost * 100) / 100 } : {}) }
  }
  return undefined
}

/** Whether the patch format is known for this pedal: the MS-70CDR's (and MIDISTOMP's, which answers as one). */
export const canEditPatches = (deviceId: number | undefined) => deviceId === 0x61
/** How many slots take a live knob message (0x31): the first three on Zoom's firmware; all six from MIDISTOMP 2.0.4
 * (identity "M204", matujuice/zoom-ms-midistomp#77). Later slots take a whole-patch write instead. */
export function liveSlots(firmware: string | undefined) {
  const tag = /^M(\d)(\d)(\d)$/.exec((firmware ?? '').trim())
  return tag && +tag.slice(1).join('') >= 204 ? 6 : 3
}
