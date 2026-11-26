import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDt2RenderSection, unpackDt2SharcSection, type Dt2RenderPlan } from '../elektron/dt2-sharc'
import { readEle3Syx } from '../elektron/ele3'
import type { ParsedMod } from '../elektron/elemod'
import { sharcProgramCounter } from '../elektron/sharc-asm'
import { DT2_BASE_SHARC, dt2RegisteredMachines, planDt2MachineParts, readDt2SharcPart, type Dt2SharcPart } from './dt2-render-build'

const code8 = btoa('\x01\x02\x03\x04\x05\x06\x07\x08')
const part = (extra: Record<string, unknown> = {}) => ({ build: { dt2_sharc: { version: 2, allocations: [{ address: 0x200d0000, data: code8, code: true }], players: [{ type: 7, entry: 0xbe8000 }], ...extra } } })

describe('Digitakt II machine sound-chip parts', () => {
  it('reads a module\'s allocations and players, and finds none in a package without a part', () => {
    expect(readDt2SharcPart('mikrotakt', part())).toEqual({
      module: 'mikrotakt',
      allocations: [{ address: 0x200d0000, bytes: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8), code: true }],
      players: [{ type: 7, entry: 0xbe8000 }],
    })
    expect(readDt2SharcPart('plain', { build: {} })).toBeNull()
  })

  it('leaves the sidechain work\'s render-hook format (version 1) to its own path', () => {
    expect(readDt2SharcPart('sidechain', { build: { dt2_sharc: { version: 1, code: '', data: '' } } })).toBeNull()
  })

  it('refuses an unknown version, a malformed entry and code over the base\'s machine parts', () => {
    expect(() => readDt2SharcPart('m', part({ version: 3 }))).toThrow('unsupported sound-chip part')
    expect(() => readDt2SharcPart('m', part({ players: [{ type: '7', entry: 1 }] }))).toThrow('malformed machine player')
    expect(() => readDt2SharcPart('m', part({ allocations: [{ address: DT2_BASE_SHARC.dispatcher, data: btoa('xxxx'), code: true }] })))
      .toThrow('overlaps the base')
    expect(() => readDt2SharcPart('m', part({ allocations: [{ address: 0x200d0000, data: code8 }] }))).toThrow('malformed sound-chip allocation')
  })

  it('refuses a player that does not start in the part\'s own code', () => {
    expect(() => readDt2SharcPart('m', part({ allocations: [{ address: 0x200d0000, data: code8, code: false }] })))
      .toThrow('does not start in its own sound-chip code')
    expect(() => readDt2SharcPart('m', part({ players: [{ type: 7, entry: 0xbe9000 }] }))).toThrow('does not start in its own sound-chip code')
  })
})

/** A mod that registers machines as a build does: core_machines entries pointing at records in its .run. */
function machineMod(records: [type: number, standsFor: number][]): ParsedMod {
  const run = new Uint8Array(16 * records.length)
  records.forEach(([type, standsFor], index) => { new DataView(run.buffer).setUint32(16 * index, type); new DataView(run.buffer).setUint32(16 * index + 4, standsFor) })
  return {
    sections: { '.run': { align: 4, length: run.length, parts: [{ kind: 'hex', bytes: run }] } },
    symbols: new Map(records.map((_, index) => ['machine' + index, ['.run', 16 * index]])),
    contribute: records.map((_, index) => ({ to: 'core_machines', order: 50, data: new Uint8Array(4), relocs: [{ offset: 0, type: 'abs32', target: 'sym:machine' + index, addend: 0 }], claims: [], index })),
  } as unknown as ParsedMod
}

describe('the machines a module registers', () => {
  it('reads each core_machines record\'s type and stand-in', () => {
    expect(dt2RegisteredMachines('two', machineMod([[7, 0], [9, 4]]))).toEqual([
      { module: 'two', type: 7, standsFor: 0 }, { module: 'two', type: 9, standsFor: 4 }])
    expect(dt2RegisteredMachines('none', machineMod([]))).toEqual([])
  })

  it('refuses an entry whose record it cannot read', () => {
    const mod = machineMod([[7, 0]])
    mod.contribute[0].relocs[0].target = 'sym:missing'
    expect(() => dt2RegisteredMachines('m', mod)).toThrow('cannot be read')
  })
})

describe('the base\'s sound-chip parts for a set', () => {
  const sharc = new Uint8Array(64) // not the stock section: these cases are refused before it is read
  it('leaves the sound chip stock for a set with no machine, part or frame receiver', async () => {
    expect(await planDt2MachineParts(sharc, [], [])).toBeNull()
  })

  it('refuses a player for a type its module does not register, a type registered twice and a bad stand-in', async () => {
    const player: Dt2SharcPart = { module: 'a', allocations: [], players: [{ type: 7, entry: 0xbe8000 }] }
    await expect(planDt2MachineParts(sharc, [{ module: 'b', type: 7, standsFor: 0 }], [player])).rejects.toThrow('which it does not register')
    await expect(planDt2MachineParts(sharc, [{ module: 'a', type: 7, standsFor: 0 }, { module: 'b', type: 7, standsFor: 0 }], [])).rejects.toThrow('same machine type')
    await expect(planDt2MachineParts(sharc, [{ module: 'a', type: 7, standsFor: 7 }], [])).rejects.toThrow('not a stock type')
    await expect(planDt2MachineParts(sharc, [{ module: 'a', type: 11, standsFor: 0 }], [])).rejects.toThrow('not one of 7-10')
  })
})

// With the owner's OS 1.17 file (never in the repository): MODWERK_DT2_STOCK=<path to Digitakt_II_OS1.17.syx>.
const STOCK = process.env.MODWERK_DT2_STOCK
describe.runIf(STOCK)('the base\'s sound-chip parts with the owner\'s OS', () => {
  const sharc = () => unpackDt2SharcSection(readEle3Syx(new Uint8Array(readFileSync(STOCK!))).stored.get(7))
  const block = (plan: Dt2RenderPlan, address: number) => plan.allocations.find(item => item.address === address)!.bytes
  const jump = (pc: number) => Uint8Array.of(0x3e, 0x06, (pc >>> 16) & 255, pc >>> 24, pc & 255, (pc >>> 8) & 255)
  const RTS = Uint8Array.of(0xbe, 0x0a, 0, 0, 0, 0)
  const slot = (plan: Dt2RenderPlan, base: number, k: number) => block(plan, base).subarray(6 * k, 6 * k + 6)
  const fixture: Dt2SharcPart = { module: 'grains', allocations: [{ address: 0x200d0000, bytes: new Uint8Array(8), code: true }], players: [{ type: 7, entry: 0xbe8000 }] }

  it('gives a machine with no player its stand-in\'s selector and leaves every player slot empty', async () => {
    const stock = sharc()
    const plan = (await planDt2MachineParts(stock, [{ module: 'synth', type: 8, standsFor: 2 }], []))!
    const table = block(plan, DT2_BASE_SHARC.selectors)
    expect(table.length).toBe(4 * 11)
    expect(table.subarray(4 * 8, 4 * 9)).toEqual(table.subarray(4 * 2, 4 * 3))
    for (const k of [0, 2, 3]) expect(table.subarray(4 * (7 + k), 4 * (8 + k))).toEqual(table.subarray(0, 4))
    const empty = slot(plan, DT2_BASE_SHARC.playerSlots, 0)
    for (let k = 1; k < 4; k++) expect(slot(plan, DT2_BASE_SHARC.playerSlots, k)).toEqual(empty)
    for (let k = 0; k < 4; k++) expect(slot(plan, DT2_BASE_SHARC.frameSlots, k)).toEqual(RTS)
    await buildDt2RenderSection(stock, plan)
  })

  it('runs two machines beside the stock types, one with its own player, through the same base code', async () => {
    const stock = sharc()
    const one = (await planDt2MachineParts(stock, [{ module: 'synth', type: 8, standsFor: 2 }], []))!
    const two = (await planDt2MachineParts(stock, [{ module: 'grains', type: 7, standsFor: 0 }, { module: 'synth', type: 9, standsFor: 4 }], [fixture]))!
    expect(slot(two, DT2_BASE_SHARC.playerSlots, 0)).toEqual(jump(0xbe8000))
    expect(slot(two, DT2_BASE_SHARC.playerSlots, 2)).toEqual(slot(one, DT2_BASE_SHARC.playerSlots, 2))
    const table = block(two, DT2_BASE_SHARC.selectors)
    expect(table.subarray(4 * 9, 4 * 10)).toEqual(table.subarray(4 * 4, 4 * 5))
    // The base's code and the sites it changes are the same whatever the set: only slots and selector words follow it.
    for (const address of [DT2_BASE_SHARC.dispatcher, DT2_BASE_SHARC.wire]) expect(block(two, address)).toEqual(block(one, address))
    expect(two.sites).toEqual(one.sites)
    expect(two.receiveInstruction).toEqual(one.receiveInstruction)
    await buildDt2RenderSection(stock, two)
  })

  it('calls frame receivers through the frame slots instead of giving them the receive site', async () => {
    const stock = sharc()
    const plan = (await planDt2MachineParts(stock, [], [], [0x200d0000]))!
    expect(slot(plan, DT2_BASE_SHARC.frameSlots, 0)).toEqual(jump(sharcProgramCounter(0x200d0000)))
    for (let k = 1; k < 4; k++) expect(slot(plan, DT2_BASE_SHARC.frameSlots, k)).toEqual(RTS)
  })

  it('refuses a set whose stock section is not the pinned one', async () => {
    const changed = sharc().slice()
    changed[changed.length - 1] ^= 1
    await expect(planDt2MachineParts(changed, [{ module: 'synth', type: 8, standsFor: 2 }], [])).rejects.toThrow('Unsupported Digitakt II SHARC image')
  })
})
