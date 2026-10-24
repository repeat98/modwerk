import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { loadAny } from '../../../vendor/elekloader/kit/src/patch.ts'
import metadata from '../assets/stock-dsp-metadata.json' with { type: 'json' }
import type { StockDspCore } from '../stock-dsp.ts'
import { baseIdentity, buildBase, fillBase, type BaseFill } from './octatrack-base.ts'

const cores = [{ tag: 'A', shared: [{ destination: 0x7d1, words: Uint32Array.of(0x0a0b0c, 0x0d0e0f) }],
  packages: [{ fxId: 4, words: Uint32Array.of(0x123456, 0xabcdef, 0x000001) }] }] as unknown as StockDspCore[]
const stripped = JSON.stringify({
  sections: { '.run': { len: 14, parts: [['hex', 'aa'], ['stock', '0x40000400', 2], ['hex', 'bbcc']] } },
  sites: [{ addr: '0x400f0ee3', len: 6, new: '1122' + '33' }],
})

describe('the Octatrack base from the stock file', () => {
  it('reads IDENTIFY’s exact configuration digest from authored package bytes, across section parts', () => {
    const digest = '0123456789abcdef'.repeat(4)
    const packageText = (parts: unknown[]) => JSON.stringify({ symbols: { modwerk_base_digest: ['.run', 4] }, sections: { '.run': { parts } } })
    expect(baseIdentity(packageText([['hex', '00'.repeat(4) + digest.slice(0, 20)], ['hex', digest.slice(20) + 'ff']]))).toBe(digest)
    expect(() => baseIdentity(packageText([['hex', '00'.repeat(4)], ['stock', '0x40000400', 32]]))).toThrow('authored USB identity')
    expect(() => baseIdentity(packageText([['hex', '00'.repeat(4) + digest.slice(0, 60)]]))).toThrow('invalid USB identity')
    expect(() => baseIdentity('{}')).toThrow('no USB identity')
  })

  it('puts stock words back where the package left them out, ColdFire copies big-endian, DSP sites little-endian', () => {
    const fills: BaseFill[] = [
      { tag: 'A', fx: 4, first: 1, count: 2, section: '.run', offset: 6 },
      { tag: 'A', fx: 4, first: 0, count: 1, section: '.run', offset: 0 },
      { tag: 'A', shared: 0x7d1, first: 1, count: 1, site: '0x400f0ee3', offset: 2 },
    ]
    const doc = JSON.parse(fillBase(stripped, fills, cores))
    expect(doc.sections['.run'].parts).toEqual([['hex', '123456'], ['hex', 'aa'], ['stock', '0x40000400', 2], ['hex', 'abcdef000001'], ['hex', 'bbcc']])
    expect(doc.sites[0].new).toBe('1122' + '0f0e0d' + '33')
  })

  it('refuses fills its recipes or the package cannot hold', () => {
    const fill = { tag: 'A', fx: 4, first: 0, count: 1, section: '.run', offset: 0 }
    expect(() => fillBase(stripped, [{ ...fill, fx: 5 }], cores)).toThrow('does not have')
    expect(() => fillBase(stripped, [{ ...fill, count: 4 }], cores)).toThrow('does not have')
    expect(() => fillBase(stripped, [{ ...fill, offset: 2 }], cores)).toThrow('room')
    expect(() => fillBase(stripped, [{ tag: 'A', shared: 0x7d1, first: 0, count: 1, site: '0x400f0ee3', offset: 4 }], cores)).toThrow('room')
  })

  it('builds only from the original OS 1.40C file', async () => {
    await expect(buildBase(new Uint8Array(469852), '{}', [])).rejects.toThrow('original Octatrack OS 1.40C')
  })

  it('commits a package the kit refuses until every fill names a stock recipe that closes its gap', () => {
    const text = readFileSync(new URL('../assets/octatrack-base.elemod', import.meta.url), 'utf8')
    const fills = JSON.parse(readFileSync(new URL('../assets/octatrack-base-fills.json', import.meta.url), 'utf8')) as BaseFill[]
    const doc = JSON.parse(text), missing = new Map<string, number>()
    for (const [name, section] of Object.entries(doc.sections as Record<string, { len?: number; parts?: (['hex', string] | ['stock', string, number])[] }>))
      if (section.parts) missing.set(name, section.len! - section.parts.reduce((n, p) => n + (p[0] === 'hex' ? p[1].length / 2 : p[2]), 0))
    for (const site of doc.sites as { addr: string; len: number; new: string }[]) missing.set(site.addr, site.len - site.new.length / 2)
    for (const fill of fills) {
      const payload = metadata.payloads.find(p => p.tag === fill.tag)!
      const recipe = 'curve' in fill ? { words: 256 } : 'fx' in fill ? payload.packages.find(p => p.fxId === fill.fx) : payload.shared.find(s => s.destination === fill.shared)
      expect(recipe && fill.first + fill.count <= recipe.words).toBe(true)
      const key = 'section' in fill ? fill.section : fill.site
      missing.set(key, missing.get(key)! - ('curve' in fill ? 4 : 3) * fill.count)
    }
    expect([...missing.values()].every(n => n === 0)).toBe(true)
    expect(fills.length).toBeGreaterThan(0)
    expect(() => loadAny({ path: '/octatrack-base.elemod', data: new TextEncoder().encode(text) })).toThrow()
  })

  it('is rebuilt whenever a file the base is built from changes', () => {
    const root = new URL('../../../', import.meta.url)
    const { folders, sources } = JSON.parse(readFileSync(new URL('../assets/octatrack-base-sources.json', import.meta.url), 'utf8')) as
      { folders: string[]; sources: Record<string, string> }
    // build_core.py's folder scan, as it hashes them; `elekloader/` is the upstream core, pinned by kit.json's commit.
    const scanned = folders.flatMap(folder => readdirSync(new URL(folder + '/', root), { withFileTypes: true })
      .filter(file => file.isFile() && /\.(c|h|s|asm|py|json)$/.test(file.name)).map(file => folder + '/' + file.name))
    const stale = [
      ...Object.keys(sources).filter(path => !path.startsWith('elekloader/') &&
        (!existsSync(new URL(path, root)) || sha(readFileSync(new URL(path, root))) !== sources[path])),
      ...scanned.filter(path => !(path in sources)),
    ]
    expect(stale, 'The committed Octatrack base is stale: run npm run octatrack:base -- --stock OS.bin --beta --write').toEqual([])
  })
})
