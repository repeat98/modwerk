// SPDX-License-Identifier: GPL-3.0-or-later
import { unpackSection } from '../aplib.ts'
import { classifySection, packedStream } from './ele3.ts'
import { sha256Hex } from './hash.ts'
import { assembleSharc } from './sharc-asm.ts'

const STOCK_SECTION = '0f514a12a2255f5c081e292c47f1f29462003177658da4bbae0a22fd737fffa2'
const RENDER_ADDRESS = 0x2838314c
const RENDER_GUARD = 'aee4910e66f86ea483231f49e79a3a3c7bfbdecf34024052d36dd87fc34f4fe3'
const RECEIVE_ADDRESS = 0x2838ea02
const RECEIVE_GUARD = 'f49335b880bf628686785987b1e4af0428d9449df3643fd96695c68ae48ec66c'
const FIRST = 0x4000, FINAL = 0x8000, FILL = 0x100
const HEADER = 16
const DT2_SHARC_SECTION_LIMIT = 0xfffff
// Unoccupied loader byte range in the pinned OS 1.17 stream.
const L2_START = 0x2001ab7c, L2_END = 0x200fa000

type Block = { offset: number; flags: number; address: number; count: number; argument: number; end: number }
type Allocation = { address: number; bytes: Uint8Array }
/** A base-owned site: one whole 48-bit instruction at a loader byte address, replaced only over its stock guard. */
export type Dt2SharcSite = { address: number; guard: string; instruction: Uint8Array }
export type Dt2RenderPlan = {
  renderInstruction?: Uint8Array
  receiveInstruction?: Uint8Array
  /** Further base-owned sites, such as the machine selector table's base (`planDt2MachineSelectors`). */
  sites?: readonly Dt2SharcSite[]
  allocations: readonly Allocation[]
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])

function sites(plan: Dt2RenderPlan): Dt2SharcSite[] {
  const all = [
    ...(plan.renderInstruction ? [{ address: RENDER_ADDRESS, guard: RENDER_GUARD, instruction: plan.renderInstruction }] : []),
    ...(plan.receiveInstruction ? [{ address: RECEIVE_ADDRESS, guard: RECEIVE_GUARD, instruction: plan.receiveInstruction }] : []),
    ...(plan.sites ?? []),
  ]
  const starts = all.map(site => site.address).sort((a, b) => a - b)
  if (!all.length || starts.some((address, i) => !Number.isInteger(address) || address % 2 || (i > 0 && address < starts[i - 1] + 6))) {
    throw new Error('Invalid SHARC patch site')
  }
  return all
}

function siteOffset(original: readonly Block[], address: number, length = 6): number {
  const matches = original.filter(block => !(block.flags & (FIRST | FINAL | FILL)) &&
    address >= block.address && address + length <= block.address + block.count)
  if (matches.length !== 1) throw new Error('Invalid SHARC patch site')
  return matches[0].offset + HEADER + address - matches[0].address
}

export async function dt2DisplacedInstruction(stock: Uint8Array, site: 'render' | 'receive'): Promise<Uint8Array> {
  const address = site === 'render' ? RENDER_ADDRESS : RECEIVE_ADDRESS
  const guard = site === 'render' ? RENDER_GUARD : RECEIVE_GUARD
  const offset = siteOffset(blocks(stock), address)
  const instruction = stock.slice(offset, offset + 6)
  if (await sha256Hex(instruction) !== guard) throw new Error('SHARC instruction guard mismatch')
  return instruction
}

async function applySites(stock: Uint8Array, original: readonly Block[], output: Uint8Array, plan: Dt2RenderPlan) {
  for (const { address, guard, instruction } of sites(plan)) {
    if (instruction.length !== 6) throw new Error('Invalid SHARC patch site')
    const offset = siteOffset(original, address)
    if (await sha256Hex(stock.subarray(offset, offset + 6)) !== guard) throw new Error('SHARC instruction guard mismatch')
    output.set(instruction, offset)
  }
}

export function unpackDt2SharcSection(bytes: Uint8Array | undefined): Uint8Array {
  if (!bytes || bytes.length > DT2_SHARC_SECTION_LIMIT + 1 || classifySection(bytes) !== 'packed') {
    throw new Error('Invalid packed SHARC section')
  }
  return unpackSection(packedStream(bytes), DT2_SHARC_SECTION_LIMIT)
}

function checkAllocations(allocations: readonly Allocation[]): void {
  const ranges = allocations.map(({ address, bytes }) => ({ start: address, end: address + bytes.length }))
    .sort((a, b) => a.start - b.start)
  for (const [index, { start, end }] of ranges.entries()) {
    if (!Number.isInteger(start) || start % 4 || end % 4 || start === end ||
        start < L2_START || end > L2_END || (index > 0 && start < ranges[index - 1].end)) {
      throw new Error('Invalid SHARC render allocation')
    }
  }
}

function blocks(bytes: Uint8Array): Block[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const result: Block[] = []
  for (let offset = 0; offset < bytes.length;) {
    const header = bytes.subarray(offset, offset + HEADER)
    if (header.length !== HEADER || header[3] !== 0xad || header.reduce((xor, byte) => xor ^ byte, 0)) {
      throw new Error('Invalid SHARC block header')
    }
    const flags = view.getUint16(offset, true)
    const address = view.getUint32(offset + 4, true)
    const count = view.getUint32(offset + 8, true)
    const argument = view.getUint32(offset + 12, true)
    const end = offset + HEADER + ((flags & FILL) ? 0 : count)
    if (count % 4 || end > bytes.length || ((flags & FINAL) && end !== bytes.length)) {
      throw new Error('Invalid SHARC block extent')
    }
    result.push({ offset, flags, address, count, argument, end })
    offset = end
  }
  if (!(result[0]?.flags & FIRST) || !((result.at(-1)?.flags ?? 0) & FINAL)) {
    throw new Error('Missing SHARC FIRST or FINAL block')
  }
  return result
}

/** Validate a depacked OS 1.17 section against a trusted base link plan. */
export async function verifyDt2RenderSection(stock: Uint8Array, built: Uint8Array, plan: Dt2RenderPlan): Promise<void> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  if (built.length > DT2_SHARC_SECTION_LIMIT || !plan.allocations.length) {
    throw new Error('Invalid SHARC render plan size')
  }
  checkAllocations(plan.allocations)

  const original = blocks(stock), modified = blocks(built)
  const finalIndex = original.length - 1
  if (modified.length !== original.length + plan.allocations.length) throw new Error('Unexpected SHARC block count')
  const growth = built.length - stock.length
  const lastFirst = original.reduce((last, block, index) => block.flags & FIRST ? index : last, -1)
  const patched = Uint8Array.from(stock)
  await applySites(stock, original, patched, plan)
  for (const [index, before] of original.entries()) {
    const after = modified[index === finalIndex ? modified.length - 1 : index]
    const expected = patched.subarray(before.offset, before.end)
    if (index === lastFirst) {
      new DataView(expected.buffer, expected.byteOffset, expected.byteLength).setUint32(12, before.argument + growth, true)
      expected[2] = 0
      expected[2] = expected.subarray(0, HEADER).reduce((xor, byte) => xor ^ byte, 0)
    }
    if (!equal(expected, built.subarray(after.offset, after.end))) throw new Error('Undeclared SHARC stock block change')
  }

  for (const [index, allocation] of plan.allocations.entries()) {
    const block = modified[finalIndex + index]
    if (block.flags !== 1 || block.argument || block.address !== allocation.address ||
        !equal(allocation.bytes, built.subarray(block.offset + HEADER, block.end))) {
      throw new Error('Invalid SHARC render allocation')
    }
  }
}

/** Build section 7 from the owner's stock stream and a base-owned render link plan. */
export async function buildDt2RenderSection(stock: Uint8Array, plan: Dt2RenderPlan): Promise<Uint8Array> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  const original = blocks(stock)
  const final = original[original.length - 1]
  const growth = plan.allocations.reduce((length, allocation) => length + HEADER + allocation.bytes.length, 0)
  if (stock.length + growth > DT2_SHARC_SECTION_LIMIT || !plan.allocations.length) {
    throw new Error('Invalid SHARC render plan size')
  }
  checkAllocations(plan.allocations)
  const output = new Uint8Array(stock.length + growth)
  output.set(stock.subarray(0, final.offset))
  output.set(stock.subarray(final.offset), final.offset + growth)
  const view = new DataView(output.buffer)
  const first = original.reduce((last, block) => block.flags & FIRST ? block : last)
  view.setUint32(first.offset + 12, first.argument + growth, true)
  const setChecksum = (offset: number) => {
    output[offset + 2] = 0
    output[offset + 2] = output.subarray(offset, offset + HEADER).reduce((sum, byte) => sum ^ byte, 0)
  }
  setChecksum(first.offset)
  await applySites(stock, original, output, plan)
  let offset = final.offset
  for (const allocation of plan.allocations) {
    view.setUint16(offset, 1, true)
    output[offset + 3] = 0xad
    view.setUint32(offset + 4, allocation.address, true)
    view.setUint32(offset + 8, allocation.bytes.length, true)
    setChecksum(offset)
    output.set(allocation.bytes, offset + HEADER)
    offset += HEADER + allocation.bytes.length
  }
  await verifyDt2RenderSection(stock, output, plan)
  return output
}
// The machine selector lookup (in the track setup, short-word PC 0x1c2731) loads the base of a seven-word table that
// maps machine types 0-6 to the voice selector; a higher type reads past it. The base points it at a longer copy.
const SELECTOR_SITE = 0x28000000 + 2 * 0x1c2731
const SELECTOR_GUARD = '6b6ef0ae1d21cc3860bb1fd860658c94652341826da44eeec9227d59be29c3af'
const SELECTOR_TABLE = 0x28000000 + 0x2567c0 // the stock table's loader byte address (normal word 0x2567c0)
const STOCK_SELECTORS = [0, 1, 2, 3, 4, 0, 5]
const I3 = 0x13

function readStored(stock: Uint8Array, address: number, length: number): Uint8Array {
  const offset = siteOffset(blocks(stock), address, length)
  return stock.subarray(offset, offset + length)
}

/** A plan fragment giving added machine types (7 and up, in order) their voice selector: a copy of the stock table
 * with `added` appended, placed at `tableAddress` in free L2, and the lookup's base pointed at it. */
export async function planDt2MachineSelectors(stock: Uint8Array, tableAddress: number, added: readonly number[]): Promise<Dt2RenderPlan> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  if (!added.length || added.some(value => !STOCK_SELECTORS.includes(value))) throw new Error('Invalid machine selector')
  if (await sha256Hex(readStored(stock, SELECTOR_SITE, 6)) !== SELECTOR_GUARD) throw new Error('SHARC selector guard mismatch')
  const view = new DataView(Uint8Array.from(readStored(stock, SELECTOR_TABLE, 4 * STOCK_SELECTORS.length)).buffer)
  if (STOCK_SELECTORS.some((value, index) => view.getUint32(4 * index, true) !== value)) throw new Error('Unexpected SHARC selector table')
  const words = [...STOCK_SELECTORS, ...added]
  const table = new Uint8Array(4 * words.length)
  words.forEach((value, index) => new DataView(table.buffer).setUint32(4 * index, value, true))
  const allocations = [{ address: tableAddress, bytes: table }]
  checkAllocations(allocations)
  // Type 17a, I3 = the table's normal-word address (L2 byte address / 4).
  return { sites: [{ address: SELECTOR_SITE, guard: SELECTOR_GUARD, instruction: instruction(0x0f00 | I3, tableAddress / 4) }], allocations }
}

// The render pass calls the stock sample voice player once per voice (a type 25a CALL); R14 counts the 32 voices
// down, voice v belongs to track v >> 1, and the track's raw machine type is the word at byte address TRACK_TYPES +
// 4 * track (stock reads it as DM(M = track, I = TRACK_TYPES); the modifier is scaled, the address is in bytes).
// Track 1 alone has the same word at TRACK_TYPES + track, so a test on track 1 cannot tell the two apart.
const PLAYER_CALL = 0x28000000 + 2 * 0x1c6b00
const PLAYER_CALL_GUARD = '4e25f0a1e4197c2c190ef606f09623a9ecf94e7274608038c39d0f09514b6621'
const STOCK_PLAYER = 0x1c4ecf
const TRACK_TYPES = 0x255970
const FIRST_ADDED_TYPE = 7, MAX_ADDED_TYPES = 4
// Universal register codes, and the 32-bit instructions the dispatcher uses (parcels, little-endian bytes).
const R0 = 0x00, R1 = 0x01, I0 = 0x10, M0 = 0x20, ASTATX = 0x76, STKYX = 0x78
const SAVED = [R0, R1, I0, M0, ASTATX, STKYX]
const parcels = (...words: number[]) => Uint8Array.from(words.flatMap(word => [word & 255, word >>> 8]))
const M0_FROM_R0 = parcels(0x703e, 0x103f)
const I0_FROM_R1 = parcels(0x703e, 0x883f)
const M0_ZERO = parcels(0x0fa0, 0x0000)
const R1_FROM_I0_M0 = parcels(0x403e, 0x00bf) // R1 = DM(M0, I0), no update

/** A machine's own voice player: the program counter (short word) of its entry in L2. */
export type Dt2MachinePlayer = { type: number; entry: number }

/** A plan fragment that sends every voice of an added machine type to that machine's player and every other voice
 * to the stock player, unchanged: a dispatcher at `codeAddress` (free L2) in place of the render pass's call, with
 * its save area and voice table at `dataAddress`. A player is entered and returns exactly as the stock player. */
export async function planDt2MachinePlayers(
  stock: Uint8Array, codeAddress: number, dataAddress: number, players: readonly Dt2MachinePlayer[],
): Promise<Dt2RenderPlan> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  if (!players.length || players.length > MAX_ADDED_TYPES || new Set(players.map(p => p.type)).size !== players.length ||
      players.some(p => !Number.isInteger(p.type) || p.type < FIRST_ADDED_TYPE || p.type >= FIRST_ADDED_TYPE + MAX_ADDED_TYPES ||
        !Number.isInteger(p.entry) || p.entry < 0xb80000 || p.entry >= 0xc00000)) {
    throw new Error('Invalid machine player')
  }
  if (await sha256Hex(readStored(stock, PLAYER_CALL, 6)) !== PLAYER_CALL_GUARD) throw new Error('SHARC player call guard mismatch')
  const save = dataAddress / 4, table = save + 8
  const data = new Uint8Array(4 * (8 + 32))
  for (let voice = 0; voice < 32; voice++) new DataView(data.buffer).setUint32(4 * (8 + voice), TRACK_TYPES + 4 * (voice >> 1), true)

  const pc = programCounter(codeAddress)
  const parts: Uint8Array[] = []
  let at = pc // short words
  const emit = (bytes: Uint8Array) => { parts.push(bytes); at += bytes.length / 2 }
  const restore = () => SAVED.forEach((reg, index) => emit(instruction(0x1000 | reg, save + index)))
  SAVED.forEach((reg, index) => emit(instruction(0x1100 | reg, save + index)))
  emit(instruction(0x0f00 | R0, 32))
  emit(instruction(0x013e, 0x200e))            // R0 = R0 - R14: the voice
  emit(M0_FROM_R0)
  emit(instruction(0x0f00 | I0, table))
  emit(R1_FROM_I0_M0)                          // its track's type word address
  emit(I0_FROM_R1)
  emit(M0_ZERO)
  emit(R1_FROM_I0_M0)                          // the track's raw machine type
  const branches: number[] = []
  for (const player of players) {
    emit(instruction(0x0f00 | R0, player.type))
    emit(instruction(0x013e, 0x2010))          // R0 = R1 - R0
    branches.push(parts.length)
    emit(new Uint8Array(6))                    // IF EQ JUMP, filled in below
  }
  restore()
  emit(instruction(0x063e, STOCK_PLAYER))
  players.forEach((player, index) => {
    parts[branches[index]] = instruction(0x0600, at)
    restore()
    emit(instruction(0x063e, player.entry))
  })
  const code = new Uint8Array((parts.reduce((n, part) => n + part.length, 0) + 3) & ~3)
  parts.reduce((offset, part) => { code.set(part, offset); return offset + part.length }, 0)
  const allocations = [{ address: codeAddress, bytes: code }, { address: dataAddress, bytes: data }]
  checkAllocations(allocations)
  return { sites: [{ address: PLAYER_CALL, guard: PLAYER_CALL_GUARD, instruction: instruction(0x1804, pc) }], allocations }
}

// The receive site: the sound chip's handler of each transfer from the ColdFire, with I3 at the received frame; the
// ColdFire's frame-tail word w arrives at DM(Mw, I0) with I0 = I3 + 0x804 and Mw = w (I3 holds a byte address: the
// address generator scales the modifier, so the offset is never written in bytes). Resume after the six displaced bytes.
const RECEIVE_RESUME = (RECEIVE_ADDRESS - 0x28000000) / 2 + 3
const TAIL = 0x804
export const DT2_MACHINE_WIRE = 16, DT2_MACHINE_WIRE_MAGIC = 0x4d4b0001
const STEP_WORDS = 18 // the 1X step, tracks 1-16 at their speeds, then the view track (16: none)
const VIEW_NONE = 16
// The machine view: 32 words a machine player writes about the view track's voice (its own magic first, then the
// track it describes), copied every transfer into words DT2_MACHINE_VIEW.. of both reply records the transmit DMA
// alternates between. The stock OS changes only words 0, 5 and 679 of a record (emulator reply watch). The ColdFire
// receives a record as 16-bit units, each word low half first (machine-frame.c).
export const DT2_MACHINE_VIEW = 600
const VIEW_WORDS = 32, VIEW_AT = 26, VIEW_SAVE = VIEW_AT + VIEW_WORDS, L1_SAVE = VIEW_SAVE + 2
const REPLY_RECORDS = [0x266220, 0x267220] // L1 byte addresses

/** A plan fragment for the base's machine wire: at the receive site, a receiver at `codeAddress` (free L2) copies the
 * step words the ColdFire base writes into the frame tail after its magic (DT2_MACHINE_WIRE: the samples per sixteenth
 * step at 1X, each track's at its speed, then the view track) to the words from `dataAddress + 0x20`, where machine
 * players read them (6,000, 120 BPM, and no view track until the first frame), copies the machine view from
 * `dataAddress + 4 * 26` into both reply records, then replays the displaced instruction and resumes. It keeps every
 * register it touches. */
export async function planDt2MachineWire(stock: Uint8Array, codeAddress: number, dataAddress: number): Promise<Dt2RenderPlan> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  const displaced = await dt2DisplacedInstruction(stock, 'receive')
  const save = dataAddress / 4
  const { blocks, symbols } = assembleSharc(`
.code ${codeAddress}
  DM(${save}) = R0
  DM(${save + 1}) = R1
  DM(${save + 2}) = I0
  DM(${save + 3}) = M0
  DM(${save + 4}) = ASTATX
  DM(${save + 5}) = STKYX
  DM(${save + 6}) = I1
  DM(${save + 7}) = L0
  DM(${save + L1_SAVE}) = L1
  L0 = 0
  L1 = 0
  R0 = I3
  R1 = ${TAIL}
  R0 = R0 + R1
  I0 = R0
  M0 = ${DT2_MACHINE_WIRE}
  R0 = DM(M0, I0)
  R1 = ${DT2_MACHINE_WIRE_MAGIC}
  COMP(R0, R1)
  IF NE JUMP absent
  M0 = ${DT2_MACHINE_WIRE + 1}
  R0 = DM(I0, M0)
  I1 = ${dataAddress + 0x20}
  M0 = 1
  LCNTR = ${STEP_WORDS}, DO copied UNTIL LCE
  R0 = DM(I0, M0)
  NOP
copied: DM(I1, M0) = R0
absent:
  DM(${save + VIEW_SAVE}) = I2
  DM(${save + VIEW_SAVE + 1}) = L2
  L2 = 0
  I1 = ${dataAddress + 4 * VIEW_AT}
  I0 = ${REPLY_RECORDS[0] + 4 * DT2_MACHINE_VIEW}
  I2 = ${REPLY_RECORDS[1] + 4 * DT2_MACHINE_VIEW}
  M0 = 1
  LCNTR = ${VIEW_WORDS}, DO viewed UNTIL LCE
  R0 = DM(I1, M0)
  DM(I0, M0) = R0
viewed: DM(I2, M0) = R0
  I2 = DM(${save + VIEW_SAVE})
  L2 = DM(${save + VIEW_SAVE + 1})
  R0 = DM(${save})
  R1 = DM(${save + 1})
  I0 = DM(${save + 2})
  M0 = DM(${save + 3})
  ASTATX = DM(${save + 4})
  STKYX = DM(${save + 5})
  I1 = DM(${save + 6})
  L0 = DM(${save + 7})
  L1 = DM(${save + L1_SAVE})
displaced: NOP
  JUMP ${RECEIVE_RESUME}
`)
  const code = blocks[0].bytes
  code.set(displaced, (symbols.get('displaced')! - programCounter(codeAddress)) * 2)
  const data = new Uint8Array(4 * (L1_SAVE + 1))
  for (let word = 0; word < STEP_WORDS - 1; word++) new DataView(data.buffer).setUint32(4 * (8 + word), 6000, true)
  new DataView(data.buffer).setUint32(4 * (8 + STEP_WORDS - 1), VIEW_NONE, true)
  // The view block until a player writes it: no player's magic, a recognisable pattern.
  for (let word = 0; word < VIEW_WORDS; word++) new DataView(data.buffer).setUint32(4 * (VIEW_AT + word), 0x4d4b5600 + word, true)
  const allocations = [{ address: codeAddress, bytes: code }, { address: dataAddress, bytes: data }]
  checkAllocations(allocations)
  return { receiveInstruction: instruction(0x063e, programCounter(codeAddress)), allocations }
}

/** One plan from several fragments (a render plan and the machine selectors, say). */
export function combineDt2Plans(...plans: readonly (Dt2RenderPlan | null)[]): Dt2RenderPlan | null {
  const present = plans.filter((plan): plan is Dt2RenderPlan => plan !== null)
  if (!present.length) return null
  const pick = (key: 'renderInstruction' | 'receiveInstruction') => {
    const found = present.filter(plan => plan[key])
    if (found.length > 1) throw new Error('Two SHARC plans set the same site')
    return found[0]?.[key]
  }
  return {
    renderInstruction: pick('renderInstruction'),
    receiveInstruction: pick('receiveInstruction'),
    sites: present.flatMap(plan => plan.sites ?? []),
    allocations: present.flatMap(plan => plan.allocations),
  }
}

const RENDER_RESUME = 0x1c18a9
const RENDER_REGISTERS = [
  ...Array.from({ length: 16 }, (_, index) => index), // R0–R15
  0x10, 0x11, 0x12, // I0–I2
  0x24, 0x25, 0x26, // M4–M6
  0x30, 0x31, 0x32, // L0–L2
  0x78, 0x76, // STKYX, ASTATX
]
// Normal-word L2 byte addresses and short-word program counters use different aliases.
const programCounter = (address: number) => 0xb80000 + (address - 0x20000000) / 2

function instruction(opcode: number, operand: number): Uint8Array {
  return Uint8Array.of(opcode & 255, opcode >>> 8, (operand >>> 16) & 255, operand >>> 24,
    operand & 255, (operand >>> 8) & 255)
}

/** Place the dispatcher and its register save area together in L2.
 * Subscribers return to the dispatcher and may clobber only the saved registers.
 * Subscriber entry points are the starts of their respective allocations. */
export async function planDt2Render(
  stock: Uint8Array,
  dispatcherAddress: number,
  input: readonly Allocation[],
  output: readonly Allocation[],
  bridge?: { receiverAddress: number; data: readonly Allocation[] },
): Promise<Dt2RenderPlan | null> {
  if (await sha256Hex(stock) !== STOCK_SECTION) throw new Error('Unsupported Digitakt II SHARC image')
  if (input.length > 4 || output.length > 4) throw new Error('SHARC render phase exceeds four subscribers')
  if (!input.length && !output.length) return null
  const subscribers = [...input, ...output].map(({ address, bytes }) => ({ address, bytes: Uint8Array.from(bytes) }))
  const codeSize = (6 * (2 * RENDER_REGISTERS.length + subscribers.length + 2) + 3) & ~3
  const dispatcher = new Uint8Array(codeSize + 4 * RENDER_REGISTERS.length)
  const allocations = [{ address: dispatcherAddress, bytes: dispatcher }, ...subscribers,
    ...(bridge?.data.map(({ address, bytes }) => ({ address, bytes: Uint8Array.from(bytes) })) ?? [])]
  checkAllocations(allocations)
  if (bridge && (!Number.isInteger(bridge.receiverAddress) || bridge.receiverAddress % 2 ||
    !allocations.some(({ address, bytes }) => bridge.receiverAddress >= address &&
      bridge.receiverAddress + 6 <= address + bytes.length))) {
    throw new Error('Invalid SHARC frame receiver entry')
  }
  const site = blocks(stock).find(block => !(block.flags & (FIRST | FINAL | FILL)) &&
    RENDER_ADDRESS >= block.address && RENDER_ADDRESS + 6 <= block.address + block.count)
  if (!site) throw new Error('Missing SHARC render site')
  const start = site.offset + HEADER + RENDER_ADDRESS - site.address
  const original = stock.subarray(start, start + 6)
  if (await sha256Hex(original) !== RENDER_GUARD) throw new Error('SHARC render guard mismatch')
  const saves = (dispatcherAddress + codeSize) / 4
  let offset = 0
  const emit = (bytes: Uint8Array) => {
    dispatcher.set(bytes, offset)
    offset += bytes.length
  }
  RENDER_REGISTERS.forEach((reg, index) => emit(instruction(0x1100 | reg, saves + index)))
  subscribers.forEach(subscriber => emit(instruction(0x06be, programCounter(subscriber.address))))
  RENDER_REGISTERS.forEach((reg, index) => emit(instruction(0x1000 | reg, saves + index)))
  emit(original)
  emit(instruction(0x063e, RENDER_RESUME))
  return {
    renderInstruction: instruction(0x063e, programCounter(dispatcherAddress)),
    receiveInstruction: bridge && instruction(0x063e, programCounter(bridge.receiverAddress)),
    allocations,
  }
}
