import { describe, expect, it } from 'vitest'
import { linkColdFireRuntime } from './coldfire-link'
import { parseColdFireObject } from './coldfire-elf'
import { resolveRomReferences } from './coldfire-runtime'
import fixture from './test-fixtures/dram-rom-symbols.json'
// A DRAM unit naming a ROM unit's global symbol (sdk/tests/test_dram_rom_symbols.py writes the fixture from the native
// rule and GNU's DRAM link): the configurator resolves the same references and links the same bytes.
async function hash(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }
const objects = fixture.objects as Record<string, string>
const units = () => fixture.units.map(name => ({ label: name, object: parseColdFireObject(Uint8Array.from(objects[name].match(/../g)!, byte => parseInt(byte, 16))) }))
const rom = new Map(Object.entries(fixture.rom as Record<string, number>))
describe('DRAM units naming ROM symbols', () => {
  it('resolves exactly the native rule\'s names and links GNU\'s bytes', async () => {
    const externals = new Map([['region_buf', fixture.region]]), linkUnits = units()
    const refs = resolveRomReferences(linkUnits, externals, rom, fixture.base)
    expect(refs).toEqual(['KEYMASK', 'fx_absent', 'fx_hook'])
    expect(Object.fromEntries([...externals].filter(([name]) => name !== 'region_buf'))).toEqual(fixture.resolved)
    const linked = linkColdFireRuntime(linkUnits, fixture.base, externals)
    expect(linked.bytes.length).toBe(fixture.bytes)
    expect(await hash(linked.bytes)).toBe(fixture.sha256)
    for (const [name, address] of Object.entries(fixture.symbols)) expect(linked.symbols.get(name) ?? externals.get(name)).toBe(address)
  })
  it('links provisionally with the same layout, then only the relocated values change', () => {
    const provisionalExternals = new Map([['region_buf', fixture.region]]), finalExternals = new Map([['region_buf', fixture.region]])
    resolveRomReferences(units(), provisionalExternals, 'provisional', fixture.base)
    resolveRomReferences(units(), finalExternals, rom, fixture.base)
    expect(provisionalExternals.get('KEYMASK')).toBe(fixture.base)
    expect(provisionalExternals.has('fx_hook')).toBe(false)
    const provisional = linkColdFireRuntime(units(), fixture.base, provisionalExternals), final = linkColdFireRuntime(units(), fixture.base, finalExternals)
    expect(provisional.bytes.length).toBe(final.bytes.length)
    expect(provisional.sections).toEqual(final.sections)
    for (const name of ['fx_read', 'shared_name']) expect(provisional.symbols.get(name)).toBe(final.symbols.get(name))
  })
  it('leaves a strong reference nothing defines to the linker, which refuses it as before', () => {
    expect(() => { const externals = new Map([['region_buf', fixture.region]]); resolveRomReferences(units(), externals, null, fixture.base); linkColdFireRuntime(units(), fixture.base, externals) }).toThrow('unresolved symbol: KEYMASK')
  })
})
