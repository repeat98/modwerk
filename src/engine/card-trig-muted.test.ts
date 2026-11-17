import { describe, expect, it } from 'vitest'
import { linkColdFireRuntime } from './coldfire-link'
import { parseColdFireObject } from './coldfire-elf'
import fixture from './test-fixtures/card-trig-muted.json'
// The card-build counterpart of ev_trig_muted (sdk/machines/octatrack/card): the configurator's DRAM link
// must give the native link's bytes, so the ask finds the answer, or 0 without one, in either builder.
async function hash(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }
const objects = fixture.objects as Record<string, string>
const unit = (name: string, i: number) => ({ label: name + '_' + i, object: parseColdFireObject(Uint8Array.from(objects[name].match(/../g)!, byte => parseInt(byte, 16))) })
describe('card-build ev_trig_muted', () => {
  for (const c of fixture.cases) it(`links as GNU does: ${c.name}`, async () => {
    const linked = linkColdFireRuntime(c.units.map(unit), fixture.base)
    expect(linked.bytes.length).toBe(c.bytes)
    expect(await hash(linked.bytes)).toBe(c.sha256)
    for (const [name, address] of Object.entries(c.symbols)) expect(linked.symbols.get(name)).toBe(address)
    const ask = linked.symbols.get('fx_ask')
    if (ask === undefined) return
    const at = ask - fixture.base, view = new DataView(linked.bytes.buffer, linked.bytes.byteOffset)
    expect(view.getUint16(at)).toBe(0x203c)
    expect(view.getUint32(at + 2)).toBe(c.ask)
    expect(c.ask).toBe(linked.symbols.get(fixture.answer) ?? 0)
  })
  it('refuses a second answer', () => {
    expect(() => linkColdFireRuntime(['bystander', 'asker', 'answerer', 'answerer'].map(unit), fixture.base)).toThrow('duplicate global symbols')
  })
})
