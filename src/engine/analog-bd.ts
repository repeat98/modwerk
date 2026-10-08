import type { RuntimeMemory } from './runtime-memory.ts'
// Native Analog BD recipe: derive both extended DSP uploads locally, including the shared stock helper.
import { requestedFacts as facts, bytesHash, word32 } from './requested-modules.ts'
import { parseDspMemory, readDspWords, writeDspWords } from './dsp-memory.ts'
import { dspWordsHash } from './stock-dsp.ts'
import { OS_LOAD_ADDRESS, applyGuardedOsWrites, type OsWrite } from './os-patches.ts'
import { rollingHash, runtimeStageLayout, BOOTSTRAP_ADDRESS } from './bootstrap.ts'
import { packGka3, unpackGka3 } from './runtime-pack.ts'
import { parseColdFireObject, relocateColdFireObject } from './coldfire-elf.ts'
import { ANALOG_BD_DONOR, assertAnalogBdDspCompanions } from './analog-bd-layout.ts'
import { staticModulePlan, type StaticDspLayout } from './static-dsp.ts'
export { ANALOG_BD_DONOR } from './analog-bd-layout.ts'
const UNCACHED = 0x08000000
const align4 = (n: number) => Math.ceil(n / 4) * 4
function payload(raw: Uint8Array, destination: number, stage: number) {
  const packed = packGka3(raw)
  const unpacked = unpackGka3(packed)
  if (unpacked.length !== raw.length || unpacked.some((b, i) => b !== raw[i])) throw new Error('Analog BD packing round-trip failed.')
  const blob = new Uint8Array(packed.length + 4); blob.set([0x4f, 0x43, 0x54, 0x41]); blob.set(packed, 4)
  return { raw, blob, destination, stage, rawHash: rollingHash(raw), packedHash: rollingHash(packed) }
}
export async function composeAnalogBd(original: Uint8Array, patched: Uint8Array, ids: readonly string[], profile: { fx1: readonly string[]; fx2: readonly string[] }, layouts: readonly StaticDspLayout[] = []) {
  assertAnalogBdDspCompanions(ids)
  const plan = staticModulePlan(ids)
  if (plan.length && (layouts.length !== 2 || !facts.analog.variants.every(variant => layouts.some(layout => layout.tag === variant.tag)))) throw new Error('Analog BD needs both DSP placement ledgers.')
  if ([...profile.fx1, ...profile.fx2].includes(ANALOG_BD_DONOR)) throw new Error('Analog BD needs the space used by ' + ANALOG_BD_DONOR + '.')
  const uploads = [], writes: OsWrite[] = [], recipe = facts.analog
  for (const variant of recipe.variants) {
    const offset = variant.payloadAddress - OS_LOAD_ADDRESS
    const memory = parseDspMemory(patched.slice(offset, offset + variant.payloadBytes)), stock = parseDspMemory(original.slice(offset, offset + variant.payloadBytes))
    const placed = layouts.find(layout => layout.tag === variant.tag)?.placed ?? []
    const overlaps = (address: number, words: number) => placed.some(span => span.address < address + words && address < span.address + span.words)
    const old = variant.spring + recipe.sharedOffset, destination = variant.spring + recipe.springWords - recipe.sharedWords
    const helper = readDspWords(stock, 0, old, recipe.sharedWords), normalized = helper.slice(); normalized[6] -= old
    if (await dspWordsHash(normalized) !== recipe.sharedSha256) throw new Error('Analog BD shared-helper fingerprint differs.')
    if (overlaps(variant.spring, variant.words.length) || overlaps(destination, recipe.sharedWords)) throw new Error('Analog BD DSP reservation is already occupied.')
    const helperTarget = readDspWords(memory, 0, destination, recipe.sharedWords), stockTarget = readDspWords(stock, 0, destination, recipe.sharedWords)
    if (helperTarget.some((word, i) => word !== stockTarget[i])) throw new Error('Analog BD shared-helper destination is already occupied.')
    helper[6] += destination - old
    writeDspWords(memory, 0, destination, helper)
    for (const call of variant.calls) {
      // DARK may itself be a donor. Never retarget an overwritten call site
      // inside a custom effect; remaining stock calls still need the helper.
      if (overlaps(call, 2)) continue
      const words = readDspWords(memory, 0, call, 2)
      if (words[0] !== 0x0bf080 || words[1] !== old) throw new Error('Analog BD shared-helper call differs.')
      writeDspWords(memory, 0, call, new Uint32Array([0x0bf080, destination]))
    }
    const code = new Uint32Array(variant.words)
    if (await dspWordsHash(code) !== variant.sha256 || code.length > recipe.springWords - recipe.sharedWords) throw new Error('Analog BD authored engine checksum or extent differs.')
    const current = readDspWords(memory, 0, variant.spring, code.length), donor = readDspWords(stock, 0, variant.spring, code.length)
    if (current.some((w, i) => w !== donor[i])) throw new Error('Analog BD engine donor is already occupied.')
    writeDspWords(memory, 0, variant.spring, code)
    for (const [i, table] of [0x215, 0x235].entries()) {
      const got = readDspWords(memory, 1, table + 0x15, 1)[0], stub = variant.null[i]
      if (!(got >= variant.spring && got < variant.spring + recipe.springWords || got === stub)) throw new Error('Analog BD dispatch differs.')
      writeDspWords(memory, 1, table + 0x15, new Uint32Array([stub]))
    }
    const seam = readDspWords(memory, 0, variant.seam, 2)
    if (seam[0] !== 0x567000 || seam[1] !== 0x20e) throw new Error('Analog BD source seam differs.')
    writeDspWords(memory, 0, variant.seam, new Uint32Array([0x0bf080, variant.entry]))
    const record = new Uint8Array((3 + recipe.xWords.length) * 3)
    for (const [i, value] of [1, recipe.xBase, recipe.xWords.length, ...recipe.xWords].entries()) { record[i * 3] = value; record[i * 3 + 1] = value >>> 8; record[i * 3 + 2] = value >>> 16 }
    const raw = new Uint8Array(memory.bytes.length + record.length)
    raw.set(memory.bytes.subarray(0, memory.trailerOffset)); raw.set(record, memory.trailerOffset); raw.set(memory.bytes.subarray(memory.trailerOffset), memory.trailerOffset + record.length)
    const upload = payload(raw, variant.destination, variant.stage)
    if (raw.length > 0x40000 || upload.blob.length > 0x40000) throw new Error('Analog BD upload outgrows its scratch space.')
    uploads.push(upload)
    writes.push({ address: variant.payloadAddress, guardLength: variant.payloadBytes, guardSha256: await bytesHash(patched.subarray(offset, offset + variant.payloadBytes)), bytes: memory.bytes, note: 'Analog BD DSP ' + variant.tag })
    writes.push({ address: variant.pointer, guardLength: 4, guardSha256: await bytesHash(word32(variant.payloadAddress)), bytes: word32(variant.destination + UNCACHED), note: 'Analog BD upload pointer ' + variant.tag })
  }
  return { bytes: await applyGuardedOsWrites(patched, writes), uploads }
}
export async function createAnalogBootstrap(runtime: Uint8Array, uploads: Awaited<ReturnType<typeof composeAnalogBd>>['uploads'], reserveBytes?: number, memory: RuntimeMemory = {}) {
  const template = facts.bootstrap, encoded = Uint8Array.from({ length: template.bytes }, (_, i) => parseInt(template.code.slice(i * 2, i * 2 + 2), 16))
  if (uploads.length !== 2 || await bytesHash(encoded) !== template.sha256) throw new Error('Invalid Analog BD bootstrap template.')
  const runtimePayload = payload(runtime, 0, 0), layout = runtimeStageLayout(runtime.length, runtimePayload.blob.length, reserveBytes, undefined, memory)
  runtimePayload.destination = layout.base; runtimePayload.stage = layout.stage
  const object = parseColdFireObject(encoded), text = object.sections.find(s => s.name === '.text')!
  const find = (name: string) => { const s = object.symbols.find(s => s.name === name); if (!s || s.section !== text.index) throw new Error('Invalid Analog BD bootstrap symbol.'); return s }
  const table = find('table'), blob0 = find('blob0'), pretable = find('pretable'), preblob0 = find('preblob0'), preblob1 = find('preblob1')
  if (table.value + 36 !== blob0.value || pretable.value !== blob0.value || pretable.value + 68 !== preblob0.value || preblob0.value !== preblob1.value || preblob1.value !== text.size) throw new Error('Changed Analog BD bootstrap geometry.')
  const cut = pretable.value, newPre = align4(cut + runtimePayload.blob.length), first = align4(newPre + 68), second = align4(first + uploads[0].blob.length)
  const content = new Uint8Array(second + uploads[1].blob.length); content.set(text.data.subarray(0, cut)); content.set(runtimePayload.blob, cut); content.set(text.data.subarray(cut), newPre)
  content.set(uploads[0].blob, first); content.set(uploads[1].blob, second)
  const view = new DataView(content.buffer)
  const row = (at: number, p: typeof runtimePayload) => [p.blob.length, p.packedHash, p.stage + UNCACHED, p.destination + UNCACHED, p.raw.length, p.rawHash, 0].forEach((v, i) => view.setUint32(at + 4 + i * 4, v))
  row(table.value + 4, runtimePayload); row(newPre + 4, uploads[0]); row(newPre + 36, uploads[1])
  const move = (n: number) => n === preblob0.value ? first : n >= cut ? n + newPre - cut : n
  // GNU local labels are represented by section symbols plus addends.
  for (const relocation of object.relocations) {
    if (relocation.section !== text.index) continue
    if (relocation.offset >= cut) relocation.offset += newPre - cut
    const sym = object.symbols[relocation.symbol]
    if (sym.section === text.index && sym.type === 3) {
      if (relocation.offset === table.value + 4) continue
      if (relocation.addend === preblob0.value) relocation.addend = relocation.offset === newPre + 4 ? first : second
      else if (relocation.addend >= cut) relocation.addend = move(relocation.addend)
    }
  }
  pretable.value = newPre; preblob0.value = first; preblob1.value = second
  text.data = content; text.size = content.length
  const placements = new Map(object.sections.filter(s => s.flags & 2).map(s => [s.index, { address: s.index === text.index ? BOOTSTRAP_ADDRESS : Math.ceil((BOOTSTRAP_ADDRESS + text.size) / s.alignment) * s.alignment }]))
  const linked = relocateColdFireObject(object, placements, new Map([['octamod_pre_table', BOOTSTRAP_ADDRESS + newPre]]))
  const occupied = [{ start: layout.base, end: layout.runtimeEnd }, { start: layout.stage, end: layout.stageEnd }]
  if (layout.bssEnd) occupied.push({ start: layout.runtimeEnd, end: layout.bssEnd })
  for (const region of memory.regions ?? []) occupied.push({ start: region.address, end: region.address + region.size })
  for (const u of uploads) for (const [start, size] of [[u.destination, u.raw.length], [u.stage, u.blob.length]]) {
    const end = start + size
    if (start < layout.base || end > layout.ceiling || occupied.some(r => start < r.end && r.start < end)) throw new Error('Analog BD boot payloads overlap or exceed reserved memory.')
    occupied.push({ start, end })
  }
  return { append: linked.sections.find(s => s.index === text.index)!.data, layout }
}
