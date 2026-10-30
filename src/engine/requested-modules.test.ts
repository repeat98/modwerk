import { describe, expect, it } from 'vitest'
import { requestedFacts, readRequestedObject, bytesHash, requestedTables, requestedCaves, selectedRequestedGroups, requestedObjectDram, requestedObjectSelected } from './requested-modules'
import { parseColdFireObject } from './coldfire-elf'
import { linkColdFireRuntime } from './coldfire-link'
import proofs from './assets/requested-link-proofs.json'
describe('reviewed requested runtime packages', () => {
  // Historical 8.2 link fixtures remain archived evidence; MIDISC2.0 uses no relocatable units.
  for (const proof of proofs.proofs.filter(proof=>!proof.ids.includes('midi-scenes'))) it('matches stock-free GNU link: ' + proof.ids.join(', '), async () => {
    const units = proof.labels.map(label => {
      const pkg = requestedFacts.objects.find(p => p.label === label)!
      return { label, object: parseColdFireObject(Uint8Array.from(pkg.code.match(/../g)!, b => parseInt(b, 16))) }
    })
    const linked = linkColdFireRuntime(units, 0x40a955e0)
    expect(linked.bytes.length).toBe(proof.bytes)
    expect(await bytesHash(linked.bytes)).toBe(proof.sha256)
    // GNU adds these three synthetic boundaries; compare every authored export.
    expect(Object.fromEntries(linked.symbols)).toEqual(Object.fromEntries(Object.entries(proof.exports).filter(([name]) => !['__bss_start', '_edata', '_end'].includes(name))))
  })
  it('requires local fingerprinted USB spans and bundles only zero placeholders', async () => {
    const pkg = requestedFacts.objects.find(p => p.label === 'usbmidi_cfg')!
    const object = parseColdFireObject(Uint8Array.from(pkg.code.match(/../g)!, b => parseInt(b, 16)))
    expect(pkg.stockCopies).toHaveLength(4)
    for (const copy of pkg.stockCopies) expect(object.sections[copy.section].data.slice(copy.offset, copy.offset + copy.bytes)).toEqual(new Uint8Array(23))
    await expect(readRequestedObject('usbmidi_cfg')).rejects.toThrow('verified local firmware')
    await expect(readRequestedObject('usbmidi_cfg', new Uint8Array(0x100000))).rejects.toThrow('fingerprint differs')
    await expect(readRequestedObject('unreviewed-unit')).rejects.toThrow('Invalid requested')
  })
})


describe('live playback and mute integration', () => {
  it('keeps POLY’s four replay spans as exact guarded zero placeholders', () => {
    const pkg = requestedFacts.objects.find(row => row.label === 'polyui')!
    const group = requestedFacts.groups.find(row => row.moduleId === 'poly8')!
    const object = parseColdFireObject(Uint8Array.from(pkg.code.match(/../g)!, byte => parseInt(byte, 16)))
    expect(pkg.stockCopies.map(copy => [copy.source, copy.bytes])).toEqual([[0x400334d8, 6], [0x4007981c, 6], [0x4003a52e, 8], [0x4003cd98, 8]])
    for (const copy of pkg.stockCopies) {
      expect(object.sections[copy.section].data.slice(copy.offset, copy.offset + copy.bytes)).toEqual(new Uint8Array(copy.bytes))
      expect(group.detours.some(hook => hook.address === copy.source && hook.guardLength === copy.bytes && hook.guardSha256 === copy.sha256)).toBe(true)
    }
  })
  it('inserts MUTE MODE before existing rows and retains the final MKII LED BRIGHTNESS row', async () => {
    const tables = requestedFacts.groups.find(group => group.moduleId === 'mute-modes')!.tables
    const original = new Uint8Array(0x100000), view = new DataView(original.buffer), symbols = new Map<string, number>()
    const captured: Uint8Array[] = []
    for (const table of tables) {
      for (let i = 0; i < table.count; i++) view.setUint32(table.old - 0x40000400 + i * 4, 0x40010000 + i * 4)
      for (const ref of table.refs) view.setUint32(ref.address - 0x40000400, ref.old)
      for (const row of table.symbols) symbols.set(row.symbol, 0x40020000)
    }
    await requestedTables(original, ['mute-modes'], 0x400d7800, async (_address, bytes) => { captured.push(bytes) }, symbols)
    for (const bytes of captured) {
      const result = new DataView(bytes.buffer)
      expect(result.getUint32(0)).toBe(0x40010000)
      expect(result.getUint32(4)).toBe(0x40010004)
      expect(result.getUint32(8)).toBe(0x40020000)
      expect(result.getUint32(bytes.length - 4)).toBe(0x4001003c)
    }
  })
  it('selects the ratified sidechain mute variant only when sidechain is carried', async () => {
    const pkg = requestedFacts.objects.find(row => row.label === 'mm_softmute')!
    const plain = await readRequestedObject(pkg.label), sidechain = await readRequestedObject(pkg.label, undefined, ['mute-modes', 'sidechain-compressor'])
    expect(plain.object.sections.find(row => row.name === '.text')!.data.length).toBe(970)
    expect(sidechain.object.sections.find(row => row.name === '.text')!.data.length).toBe(1086)
  })
  it('relocates all eleven recorder sentinels to the reserved sample arena, leaving stock literals behind', async () => {
    const poolBase = 0x40a955e0 + 16 * 6144, captured: Uint8Array[] = []
    await requestedCaves(['recorder-loop-fix'], 0x400d6b80, 0x400d24d0, 0x400d7c00, async (_address, bytes) => { captured.push(bytes) }, poolBase)
    let count = 0
    for (const bytes of captured) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let i = 0; i + 4 <= bytes.length; i += 2) { const literal = view.getUint32(i); expect(literal).not.toBe(0x40a955e0); if (literal === poolBase) count++ }
    }
    expect(count).toBe(11)
  })
})


describe('POLY8 companion composition', () => {
  const companions = ['repitch', 'mute-modes', 'quantizer', 'vector', 'synth', 'analog-bassdrum']
  it('accepts every companion subset with one guarded owner at each shared seam', () => {
    for (let mask = 0; mask < 1 << companions.length; mask++) {
      const ids = ['poly8', ...companions.filter((_id, bit) => mask & (1 << bit))]
      expect(() => selectedRequestedGroups(ids)).not.toThrow()
    }
    expect(() => selectedRequestedGroups(['vector', 'analog-bassdrum'])).toThrow('conflicting native')
    expect(() => selectedRequestedGroups(['synth', 'quantizer'])).toThrow('conflicting native')
  })
  it('refuses a changed reviewed seam and unknown overlapping claims', () => {
    const group = requestedFacts.groups.find(group => group.moduleId === 'vector')!
    const hook = group.detours.find(row => row.address === 0x400334d8)!
    const hash = hook.guardSha256
    try { hook.guardSha256 = '0'.repeat(64); expect(() => selectedRequestedGroups(['poly8', 'vector'])).toThrow('seam drift') }
    finally { hook.guardSha256 = hash }
    group.detours.push({ ...hook, address: hook.address + 2 })
    try { expect(() => selectedRequestedGroups(['poly8', 'vector'])).toThrow('conflicting native') }
    finally { group.detours.pop() }
  })
  it('preserves FM’s complete helper and data pointer block before the shared renderer entry', () => {
    const ids = ['poly8', 'synth', 'vector', 'repitch', 'mute-modes', 'quantizer']
    const units = requestedFacts.objects.filter(pkg => ids.includes(pkg.moduleId) && requestedObjectDram(pkg, ids) && requestedObjectSelected(pkg, ids)).map(pkg => {
      const variant = pkg.variants.find(row => row.whenModules.every(id => ids.includes(id)) && row.withoutModules.every(id => !ids.includes(id))) ?? pkg
      return { label: pkg.label, object: parseColdFireObject(Uint8Array.from(variant.code.match(/../g)!, byte => parseInt(byte, 16))) }
    })
    const base = 0x40a955e0, link = linkColdFireRuntime(units, base), view = new DataView(link.bytes.buffer)
    const shared = link.symbols.get('mr_source_render')!, upstream = link.symbols.get('sy_render')!
    for (let offset = 4; offset <= 32; offset += 4) expect(view.getUint32(shared - offset - base)).toBe(view.getUint32(upstream - offset - base))
    const privateBuilder = view.getUint32(upstream - 4 - base)
    expect(privateBuilder).toBeGreaterThanOrEqual(link.sections[0].address)
    expect(privateBuilder).toBeLessThan(link.sections[0].address + link.sections[0].size)
  })
  it('uses FM’s bundled signature-aware quantizer only in a POLY8 composition', () => {
    const ids = ['poly8', 'synth', 'quantizer']
    const publicQuantizer = requestedFacts.objects.find(row => row.label === 'qz')!
    const privateQuantizer = requestedFacts.objects.find(row => row.label === 'fm_qz')!
    expect(requestedObjectSelected(publicQuantizer, ids)).toBe(false)
    expect(requestedObjectSelected(privateQuantizer, ids)).toBe(true)
    expect(requestedObjectSelected(publicQuantizer, ['quantizer'])).toBe(true)
    expect(selectedRequestedGroups(ids).find(group => group.moduleId === 'quantizer')!.tables).toEqual([])
  })
  it('moves Repitch and Mute Modes into the shared link only beside POLY8', async () => {
    for (const label of ['repitch', 'mm_softmute']) {
      const pkg = requestedFacts.objects.find(row => row.label === label)!
      expect(requestedObjectDram(pkg, ['poly8', pkg.moduleId])).toBe(true)
      expect(requestedObjectDram(pkg, [pkg.moduleId])).toBe(false)
    }
    expect(selectedRequestedGroups(['repitch'])).toEqual([])
    const plain = await readRequestedObject('mm_softmute', undefined, ['poly8', 'mute-modes'])
    const sidechain = await readRequestedObject('mm_softmute', undefined, ['poly8', 'mute-modes', 'sidechain-compressor'])
    expect(plain.object.sections.find(row => row.name === '.text')!.data.length).toBe(970)
    expect(sidechain.object.sections.find(row => row.name === '.text')!.data.length).toBe(1086)
    const solo = await readRequestedObject('mm_softmute', undefined, ['mute-modes', 'sidechain-compressor'])
    expect(sidechain.object.sections.find(row => row.name === '.text')!.data).toEqual(solo.object.sections.find(row => row.name === '.text')!.data)
    expect(sidechain.object.symbols.find(row => row.name === 'KEYMASK')?.binding).toBe(1)
    expect(solo.object.symbols.find(row => row.name === 'KEYMASK')?.binding).toBe(0)
    expect(plain.object.symbols.some(row => row.name === 'KEYMASK')).toBe(false)
  })
})
