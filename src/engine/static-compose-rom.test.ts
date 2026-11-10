import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseColdFireObject } from './coldfire-elf'
import fixture from './test-fixtures/dram-rom-symbols.json'
// planStaticOs with a DRAM unit that names ROM symbols: the real DRAM link, with the dram-rom-symbols fixture's reader in
// place of Tape Echo's package; the steps that need a stock OS (native contracts, stock DSP, the menus' guarded writes,
// the logger's and startup's stock guards) are stubbed, and the menus report the ROM symbols they would place.
const reader = parseColdFireObject(Uint8Array.from((fixture.objects as Record<string, string>).reader.match(/../g)!, byte => parseInt(byte, 16)))
const menus = vi.hoisted(() => ({ romSymbols: new Map<string, number>() }))
vi.mock('./coldfire-package.ts', async original => {
  const actual = await original<typeof import('./coldfire-package.ts')>()
  return { ...actual, readColdFirePackage: async (label: string) => label === 'tapeecho' ? { label, object: reader } : actual.readColdFirePackage(label) }
})
vi.mock('./native-contracts.ts', async original => ({ ...await original<typeof import('./native-contracts.ts')>(), verifyNativeContracts: async () => {} }))
vi.mock('./stock-dsp.ts', async original => ({ ...await original<typeof import('./stock-dsp.ts')>(), recoverStockDsp: async () => [] }))
vi.mock('./static-dsp.ts', async original => ({ ...await original<typeof import('./static-dsp.ts')>(), composeStaticDsp: async () => ({ writes: [], layouts: [] }) }))
vi.mock('./core-logger.ts', async original => ({ ...await original<typeof import('./core-logger.ts')>(), installCoreLogger: async () => ({ writes: [] }) }))
vi.mock('./beta-startup.ts', async original => ({ ...await original<typeof import('./beta-startup.ts')>(), installStartup: async () => [] }))
vi.mock('./platform-writes.ts', async original => ({ ...await original<typeof import('./platform-writes.ts')>(), createPlatformOsWrites: () => [] }))
vi.mock('./choosers.ts', async original => ({ ...await original<typeof import('./choosers.ts')>(),
  composeChoosers: async () => ({ writes: [], chooser: { fx1: [], fx2: [], hidden: [] }, romSymbols: menus.romSymbols }) }))
const { planStaticOs } = await import('./static-compose')
const rom = (names: string[]) => new Map(names.map(name => [name, name in fixture.rom ? (fixture.rom as Record<string, number>)[name] : fixture.region]))
const read = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at)

describe('planStaticOs with a DRAM unit naming ROM symbols', () => {
  beforeEach(() => { menus.romSymbols = new Map() })
  it('links the ROM addresses the menus placed', async () => {
    menus.romSymbols = rom(['KEYMASK', 'fx_hook', 'shared_name', 'region_buf'])
    const { runtime } = await planStaticOs(new Uint8Array(4), ['tapeecho'])
    expect(runtime.romRefs).toEqual(['KEYMASK', 'fx_absent', 'fx_hook', 'region_buf', 'shared_name'])
    const at = runtime.symbols.get('fx_read')! - runtime.sections[0].address
    expect(read(runtime.bytes, at + 2)).toBe(fixture.rom.KEYMASK)  // move.b KEYMASK,%d0
    expect(read(runtime.bytes, at + 8)).toBe(fixture.rom.fx_hook)   // move.l #fx_hook,%d1
    expect(read(runtime.bytes, at + 14)).toBe(0)                    // fx_absent: weak, nothing defines it
  })
  it('refuses a strong reference no ROM unit defines, as native ld does, instead of shipping the provisional base', async () => {
    menus.romSymbols = rom(['fx_hook', 'shared_name', 'region_buf'])  // KEYMASK missing: a typo, or no ROM unit
    await expect(planStaticOs(new Uint8Array(4), ['tapeecho'])).rejects.toThrow('unresolved symbol: KEYMASK')
  })
  it('refuses it when the menus place no ROM symbol at all', async () => {
    await expect(planStaticOs(new Uint8Array(4), ['tapeecho'])).rejects.toThrow('unresolved symbol')
  })
})
