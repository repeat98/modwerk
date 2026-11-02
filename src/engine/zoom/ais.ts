// TI AIS boot images (SPRAB41), the format of a Zoom MultiStomp's main OS: a stream of opcodes ending with
// jump-and-close. A port of MIDISTOMP's zoomms/ais.py (Luca Matturro, MIT; vendor/midistomp).
const MAGIC = 0x41504954, LOAD = 0x58535901, JUMP = 0x58535905, JUMP_CLOSE = 0x58535906, CALL = 0x5853590d
const ARGS: Record<number, number> = { 0x58535902: 8, 0x58535903: 0, 0x58535904: 0, 0x58535907: 16, 0x5853590a: 16, 0x58535963: 0, [JUMP]: 4, [JUMP_CLOSE]: 4 }
export type Ais = { sections: { addr: number; data: Uint8Array }[]; ops: { op: number; raw?: Uint8Array; section?: number }[]; end: number }

export const hex = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(8, '0')
const u32 = (value: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); return b }
export function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0)
  return out
}

export function parseAis(d: Uint8Array): Ais {
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const word = (o: number) => { if (o + 4 > d.length) throw new Error('The OS image is cut off at ' + hex(o) + '.'); return view.getUint32(o, true) }
  if (word(0) !== MAGIC) throw new Error('Not an AIS boot image.')
  const img: Ais = { sections: [], ops: [], end: 0 }
  for (let o = 4; ;) {
    const op = word(o)
    o += 4
    if (op === LOAD) {
      const addr = word(o), size = word(o + 4)
      img.ops.push({ op, section: img.sections.push({ addr, data: d.slice(o + 8, o + 8 + size) }) - 1 })
      o += 8 + ((size + 3) & ~3)
      continue
    }
    const n = op === CALL ? 4 + 4 * (word(o) >>> 16) : ARGS[op]
    if (n === undefined) throw new Error('Unknown AIS opcode ' + hex(op) + ' at ' + hex(o - 4) + '.')
    if (n) word(o + n - 4)
    img.ops.push({ op, raw: d.slice(o, o + n) })
    o += n
    if (op === JUMP_CLOSE) { img.end = o; return img }
  }
}

/** `n` loaded bytes at `addr`, to read or write in place. */
export function span(img: Ais, addr: number, n: number) {
  const s = img.sections.find(s => s.addr <= addr && addr < s.addr + s.data.length)
  if (!s) throw new Error(hex(addr) + ' is not inside any loaded section.')
  if (addr - s.addr + n > s.data.length) throw new Error(hex(addr) + '+' + n + ' crosses the end of its section.')
  return s.data.subarray(addr - s.addr, addr - s.addr + n)
}

/** New code or data, loaded before the final jump. */
export function addSection(img: Ais, addr: number, data: Uint8Array) {
  if (img.sections.some(s => addr < s.addr + s.data.length && s.addr < addr + data.length)) throw new Error('A new section at ' + hex(addr) + ' overlaps a loaded one.')
  img.ops.splice(img.ops.findIndex(o => o.op === JUMP || o.op === JUMP_CLOSE), 0, { op: LOAD, section: img.sections.push({ addr, data }) - 1 })
}

/** The image in the stock part's size: new stream, 0xFF padding, and the stock trailer (version, "ZOOM Corporation") kept. */
export function buildPart(img: Ais, original: Uint8Array) {
  const stream = concat([u32(MAGIC), ...img.ops.flatMap(({ op, raw, section }) => {
    if (section === undefined) return [u32(op), raw!]
    const { addr, data } = img.sections[section]
    return [u32(op), u32(addr), u32(data.length), data, new Uint8Array(-data.length & 3)]
  })])
  let tail = img.end
  while (tail < original.length && original[tail] === 0xff) tail++
  if (stream.length > tail) throw new Error('The patched OS (' + stream.length + ' B) would overwrite its trailer at ' + hex(tail) + '.')
  const out = original.slice()
  out.fill(0xff, 0, tail)
  out.set(stream)
  return out
}
