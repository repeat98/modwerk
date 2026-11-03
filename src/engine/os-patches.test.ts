import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS, type OsWrite } from './os-patches'
import { createPlatformOsWrites } from './platform-writes'
import proofs from './assets/coldfire-runtime-proofs.json'
async function hash(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }
describe('transactional guarded OS writes', () => {
  it('preflights every guard, preserves the input and writes only declared bytes', async () => {
    const original = Uint8Array.from({ length: 20 }, (_, i) => i)
    const write: OsWrite = { address: OS_LOAD_ADDRESS + 2, guardLength: 4, guardSha256: await hash(original.slice(2,6)), bytes: new Uint8Array([9,8]), note: 'synthetic unit' }
    const result = await applyGuardedOsWrites(original, [write])
    expect(result).toEqual(new Uint8Array([0,1,9,8,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]))
    expect(original).toEqual(Uint8Array.from({ length: 20 }, (_, i) => i))
    const later = { ...write, address: OS_LOAD_ADDRESS + 8 }
    await expect(applyGuardedOsWrites(original, [write,later])).rejects.toThrow('does not match the guard')
    expect(original[2]).toBe(2)
    await expect(applyGuardedOsWrites(original, [write,write])).rejects.toThrow('overlapping')
    for (const bad of [{address:0},{guardLength:1},{guardSha256:'abc'},{bytes:new Uint8Array()},{address:OS_LOAD_ADDRESS + 18},{address:OS_LOAD_ADDRESS + 0.5}]) await expect(applyGuardedOsWrites(original, [{ ...write,...bad }])).rejects.toThrow('invalid guarded range')
  })
  it('keeps Node Buffer inputs immutable as well as browser Uint8Arrays', async () => {
    const original = Buffer.from([1,2,3,4,5,6]), before = Buffer.from(original)
    const write: OsWrite = { address: OS_LOAD_ADDRESS + 2, guardLength: 2, guardSha256: await hash(original.subarray(2,4)), bytes: new Uint8Array([9,8]), note: 'synthetic Buffer guard' }
    const result = await applyGuardedOsWrites(original, [write])
    expect(result).toEqual(new Uint8Array([1,2,9,8,5,6]))
    expect(original).toEqual(before)
    result[0] = 0; expect(original[0]).toBe(1)
  })
  it('refuses missing, odd or non-code runtime hook targets before installation', () => {
    const proof = proofs.cases[6], runtime = { symbols: new Map(Object.entries(proof.symbols)), sections: proof.sections }
    expect(createPlatformOsWrites(runtime, proof.moduleIds).length).toBeGreaterThan(28)
    runtime.symbols.delete('dl_state7'); expect(() => createPlatformOsWrites(runtime, proof.moduleIds)).toThrow('unresolved runtime symbol')
    runtime.symbols.set('dl_state7', proof.symbols.dl_state7 + 1); expect(() => createPlatformOsWrites(runtime, proof.moduleIds)).toThrow('unresolved runtime symbol')
    runtime.symbols.set('dl_state7', 0); expect(() => createPlatformOsWrites(runtime, proof.moduleIds)).toThrow('unresolved runtime symbol')
    expect(() => createPlatformOsWrites({ ...runtime, sections: [] }, proof.moduleIds)).toThrow('runtime text')
  })
  it('leaves the end of PURGE SAMPLES\' bank walk stock while it moves the arena (#707)', () => {
    const proof = proofs.cases[6], runtime = { symbols: new Map(Object.entries(proof.symbols)), sections: proof.sections }
    const plan = createPlatformOsWrites(runtime, proof.moduleIds)
    expect(plan.filter(write => write.note === 'arena base')).toHaveLength(22)
    expect(plan.some(write => write.address < 0x400254fa + 4 && 0x400254fa < write.address + write.bytes.length)).toBe(false)
  })
})
