// SPDX-License-Identifier: GPL-3.0-or-later
// A ColdFire jsr or jmp with an absolute long operand (4EB9 or 4EF9, then a 32-bit address) to an odd address raises
// an address error on the real CPU, while the emulators run on: a wrong hook address or a routine linked to an odd
// offset passes every emulator test and stops a unit. This finds such jumps in the bytes a package adds, before any
// stock file is at hand. It reads no firmware and nothing but the package's own fields, so a field it does not know
// never stops it.
//
// A .elemod section holds code, tables and strings together, and nothing in the format tells them apart, so the same
// two bytes also turn up as a number in code or data. What the format does carry decides which are jumps:
// - an operand with a 32-bit absolute relocation is an address by the package's own word, and its parity follows from
//   the symbol's offset, because the linkers start .run, .fast and .bss on a multiple of four and .boot where the
//   stock image ends;
// - an operand without one counts only when it points into the stock OS or the machine's module RAM, where every
//   absolute jump of the committed packages goes and none of the numbers do.
// Indirect jumps, 16-bit absolute operands, table entries and a format-1 whole build's blob are not looked at.

/** What a package says about some of its bytes: a relocated field, or bytes it does not hold (a stock copy). `odd` is
 * set for a 32-bit absolute address whose parity is known, with the `name` to call it by. */
export type Field = { offset: number; length: number; odd?: boolean; name?: string }
export type OddJump = { offset: number; op: 'jsr' | 'jmp'; target: string }
/** Where the machine runs code: its stock main OS image, and the areas its mods' code and data go to. */
export type Machine = { mainLoad: number; mainLength: number; areas: readonly (readonly [number, number])[] }
/** A package file; files with the same `firmware` (a device and OS) may be linked together. */
export type PackageFile = { name: string; bytes: Uint8Array; firmware: string; machine: Machine }

const hex = (value: number) => (value < 0 ? '-0x' : '0x') + Math.abs(value).toString(16)
const hex32 = (value: number) => '0x' + (value >>> 0).toString(16).padStart(8, '0')

/** The jsr and jmp abs.l instructions of `bytes` whose target is odd. `origin` is the address of the first byte (its
 * parity is what matters); `runs` says whether an operand without a relocation is an address code can be at. */
export function oddJumpsIn(bytes: Uint8Array, origin: number, fields: readonly Field[], runs: (address: number) => boolean): OddJump[] {
  const at = new Map<number, Field>(), covered = new Uint8Array(bytes.length), out: OddJump[] = []
  for (const field of fields) { at.set(field.offset, field); covered.fill(1, field.offset, field.offset + field.length) }
  for (let offset = origin & 1; offset + 6 <= bytes.length; offset += 2) {
    if (bytes[offset] !== 0x4e || (bytes[offset + 1] !== 0xb9 && bytes[offset + 1] !== 0xf9) || covered[offset] || covered[offset + 1]) continue
    const op = bytes[offset + 1] === 0xb9 ? 'jsr' : 'jmp', field = at.get(offset + 2)
    if (field?.length === 4 && field.odd !== undefined) { if (field.odd) out.push({ offset, op, target: field.name ?? 'a relocated address' }) }
    else if (!covered.subarray(offset + 2, offset + 6).some(Boolean)) {
      const target = (bytes[offset + 2] << 24 | bytes[offset + 3] << 16 | bytes[offset + 4] << 8 | bytes[offset + 5]) >>> 0
      if (target & 1 && runs(target)) out.push({ offset, op, target: hex32(target) })
    }
  }
  return out
}

// The fields of a .elemod document (JSON) this reads. Numbers are numbers or "0x…" strings.
type Num = number | string
type Reloc = [offset: Num, type: string, target: string, addend: Num]
type Doc = {
  id?: unknown; version?: unknown; exports?: string[]; symbols?: Record<string, [section: string, offset: Num]>
  sections?: Record<string, { parts?: (['hex', string] | ['stock', Num, Num])[] }>; relocs?: [section: string, ...reloc: Reloc][]
  sites?: { addr: Num; new: string; relocs?: Reloc[] }[]
}
function num(value: Num): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(n)) throw new Error(JSON.stringify(value) + ' is not a number')
  return n
}
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16))

/** The jsr and jmp abs.l to an odd address in what a .elemod document adds: its sections' own bytes and its sites'
 * new bytes. `set` holds the documents it may be linked with, whose exports stand for its imports; an import none of
 * them exports is left alone. */
export function oddJumpsInElemod(doc: Doc, machine: Machine, set: readonly Doc[] = []): string[] {
  const end = machine.mainLoad + machine.mainLength
  const runs = (address: number) => [[machine.mainLoad, end], ...machine.areas].some(([lo, hi]) => lo <= address && address < hi)
  const base = (section: string) => section === '.boot' ? end : 0
  const has = (owner: Doc, name: string) => !!owner.symbols && Object.hasOwn(owner.symbols, name)
  const defined = (owner: Doc, name: string, addend: number): Pick<Field, 'odd' | 'name'> => {
    const [section, at] = owner.symbols![name], offset = num(at) + addend
    const called = (owner === doc ? '' : String(owner.id) + ' ' + String(owner.version) + ' ') + name + (addend ? (addend < 0 ? '-' : '+') + Math.abs(addend) : '')
    return { odd: !!((section === 'abs' ? offset : base(section) + offset) & 1), name: called + ' (' + (section === 'abs' ? hex32(offset) : section + '+' + hex(offset)) + ')' }
  }
  const field = ([at, type, target, add]: Reloc): Field => {
    const addend = num(add), plain = { offset: num(at), length: type === 'pc16' ? 2 : 4 }
    if (type !== 'abs32') return plain
    if (target === 'abs') return { ...plain, odd: !!(addend & 1), name: hex32(addend) }
    const name = target.slice(4)
    if (target.startsWith('sec:')) return { ...plain, odd: !!((base(name) + addend) & 1), name: name + '+' + hex(addend) }
    if (has(doc, name)) return { ...plain, ...defined(doc, name, addend) }
    const owners = set.filter(other => other !== doc && other.exports?.includes(name) && has(other, name))
    const owner = owners.find(other => defined(other, name, addend).odd) ?? owners[0]
    return owner ? { ...plain, ...defined(owner, name, addend) } : plain
  }
  const problem = (where: string, jump: OddJump) => where + '+' + hex(jump.offset) + ': ' + jump.op + ' to ' + jump.target + ', an odd address'
  const problems: string[] = []
  for (const name of ['.boot', '.run', '.fast']) {
    const parts = doc.sections?.[name]?.parts
    if (!parts) continue
    const chunks = parts.map(part => part[0] === 'hex' ? unhex(part[1]) : num(part[2]))
    const bytes = new Uint8Array(chunks.reduce<number>((sum, chunk) => sum + (typeof chunk === 'number' ? chunk : chunk.length), 0))
    const fields = (doc.relocs ?? []).filter(reloc => reloc[0] === name).map(([, ...reloc]) => field(reloc))
    let offset = 0
    for (const chunk of chunks) {
      if (typeof chunk === 'number') fields.push({ offset, length: chunk })
      else bytes.set(chunk, offset)
      offset += typeof chunk === 'number' ? chunk : chunk.length
    }
    for (const jump of oddJumpsIn(bytes, base(name), fields, runs)) problems.push(problem(name, jump))
  }
  for (const site of doc.sites ?? []) for (const jump of oddJumpsIn(unhex(site.new), num(site.addr), (site.relocs ?? []).map(field), runs)) problems.push(problem('site ' + hex32(num(site.addr)), jump))
  return problems
}

/** The same for package files that are served side by side, each problem named for its file. A file's imports are
 * looked up in every file for the same firmware, and a file that cannot be read is a problem of its own. */
export function oddJumpsInFiles(files: readonly PackageFile[]): string[] {
  const problems: string[] = [], docs = new Map<PackageFile, Doc>()
  const unreadable = (file: PackageFile, error: unknown) => problems.push(file.name + ': not a package the odd-address check can read (' + (error instanceof Error ? error.message : String(error)) + ')')
  for (const file of files) {
    try { docs.set(file, JSON.parse(new TextDecoder().decode(file.bytes)) as Doc) } catch (error) { unreadable(file, error) }
  }
  for (const [file, doc] of docs) {
    const set = [...docs].filter(([other]) => other.firmware === file.firmware).map(([, other]) => other)
    try { for (const problem of oddJumpsInElemod(doc, file.machine, set)) problems.push(file.name + ' ' + problem) } catch (error) { unreadable(file, error) }
  }
  return problems
}
