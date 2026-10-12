import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { materializeElemodRecipe as materializeModuleObject } from './elemod-recipe.ts'
import type { CompiledElemodPlan } from '../engine/elektron/module-object.ts'
import { checkLinkable, parseElemod, type LinkDevice } from '../engine/elektron/elemod.ts'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const base = 0x40000000
function fixture() {
  const stock = Uint8Array.from({ length: 1024 }, (_, i) => i % 2 ? 0x71 : 0x4e)
  const view = new DataView(stock.buffer)
  view.setUint16(0x100, 0x41f9); view.setUint32(0x102, base + 0x100); view.setUint16(0x106, 0x4e75)
  view.setUint16(0x200, 0x4eb9); view.setUint32(0x202, base + 0x100)
  const device: LinkDevice = { key: 'test-machine', machine: 'digitakt', name: 'Synthetic', sysexId: 0x0a, mainLoad: base,
    releases: [{ version: '1.0', syxSha256: 'a'.repeat(64), mainSha256: sha(stock), mainLength: stock.length }],
    areas: { ddr: [0x41000000, 0x41001000], sram: [0x50000000, 0x50001000] }, ddr: [0x41000000, 0x41001000], sramCode: [0x50000000, 0x50001000], fastTable: '', protected: [] }
  const plan: CompiledElemodPlan = { schemaVersion: 1, machine: 'digitakt', id: 'proof', version: '1.0', release: '1.0',
    module: { elemod: 2, id: 'proof', version: '1.0', target: { device: device.key, os: '1.0', syx_sha256: 'a'.repeat(64) },
      sections: { '.run': { parts: [['hex', '4e754e754e754e75']] } }, symbols: { handler: ['.run', 0], r_40000100: ['.run', 2] }, sites: [], contribute: [] },
    sites: [{ addr: '0x40000200', len: 6, stockSha256: sha(stock.subarray(0x200, 0x206)), op: 'keep2', target: 'handler' }], derive: null }
  return { stock, device, plan }
}
describe('guarded authored patch sites', () => {
  it('materializes byte edits and an explicit LEA A5 without reading an opcode into the recipe', async () => {
    const { stock, device, plan } = fixture()
    plan.sites = [
      { ...plan.sites[0], op: 'lea', target: 'handler', register: 5 },
      { addr: '0x40000020', len: 2, stockSha256: sha(stock.subarray(0x20, 0x22)), op: 'bytes', kind: 'code', new: '7208' },
    ]
    const module = await materializeModuleObject(plan, stock, [device])
    expect(module.sites).toMatchObject([{ new: '4bf900000000', relocs: [[2, 'abs32', 'sym:handler', 0]] }, { new: '7208', relocs: [] }])
    plan.sites[1].stockSha256 = 'f'.repeat(64)
    await expect(materializeModuleObject(plan, stock, [device])).rejects.toThrow('guard')
  })
  it('rejects malformed authored bytes at the compiled-plan boundary', async () => {
    const { stock, device, plan } = fixture()
    const valid = { ...plan.sites[0], op: 'bytes', kind: 'code', new: '4e714e714e71' } as Record<string, unknown>
    delete valid.target
    for (const changes of [{ target: 'handler' }, { new: '4e71' }, { new: '4e714e714ef9' }, { kind: 'unknown' }, { len: 1000 }, { new: 'zzzzzzzzzzzz' }]) {
      const sites = [{ ...valid, ...changes }] as unknown as CompiledElemodPlan['sites']
      await expect(materializeModuleObject({ ...plan, sites }, stock, [device])).rejects.toThrow()
    }
    for (const register of [-1, 8, 1.5, null]) {
      const sites = [{ ...plan.sites[0], op: 'lea', register }] as unknown as CompiledElemodPlan['sites']
      await expect(materializeModuleObject({ ...plan, sites }, stock, [device])).rejects.toThrow()
    }
  })
  it('retains the linker’s stock instruction-boundary and overlap checks', async () => {
    const { stock, device, plan } = fixture()
    plan.sites = [{ addr: '0x40000200', len: 2, stockSha256: sha(stock.subarray(0x200, 0x202)), op: 'bytes', kind: 'code', new: '4e71' }]
    let mod = parseElemod(await materializeModuleObject(plan, stock, [device]), 'proof', [device])
    expect((await checkLinkable([mod], stock)).join(' ')).toMatch(/instruction|boundary|span/)
    plan.sites = [{ addr: '0x40000020', len: 2, stockSha256: sha(stock.subarray(0x20, 0x22)), op: 'bytes', kind: 'code', new: '4e71' }]
    const other = parseElemod({ ...(await materializeModuleObject(plan, stock, [device])), id: 'other' }, 'other', [device])
    mod = parseElemod(await materializeModuleObject(plan, stock, [device]), 'proof', [device])
    expect((await checkLinkable([mod, other], stock)).join(' ')).toContain('overlap')
  })
})
