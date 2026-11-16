// SPDX-License-Identifier: GPL-3.0-or-later
import { unpackSection } from '../aplib.ts'
import { classifySection, packedStream } from './ele3.ts'
import { sha256Hex } from './hash.ts'

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
export type Dt2RenderPlan = {
  renderInstruction: Uint8Array
  receiveInstruction?: Uint8Array
  allocations: readonly Allocation[]
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])

function sites(plan: Dt2RenderPlan) {
  return [
    { address: RENDER_ADDRESS, guard: RENDER_GUARD, instruction: plan.renderInstruction },
    ...(plan.receiveInstruction ? [{ address: RECEIVE_ADDRESS, guard: RECEIVE_GUARD, instruction: plan.receiveInstruction }] : []),
  ]
}

function siteOffset(original: readonly Block[], address: number): number {
  const matches = original.filter(block => !(block.flags & (FIRST | FINAL | FILL)) &&
    address >= block.address && address + 6 <= block.address + block.count)
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
  if (built.length > DT2_SHARC_SECTION_LIMIT || plan.renderInstruction.length !== 6 || !plan.allocations.length) {
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
  if (stock.length + growth > DT2_SHARC_SECTION_LIMIT || plan.renderInstruction.length !== 6 || !plan.allocations.length) {
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
