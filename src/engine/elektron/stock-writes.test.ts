import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { StockWriteError, changedRanges, checkStockWrites, type DeclaredSite, type StockMap } from './stock-writes'

// A synthetic "stock" image of NOPs loaded at 0x40000000: no Elektron firmware involved.
const LOAD = 0x40000000
const stock = Uint8Array.from({ length: 4096 }, (_, i) => (i % 2 ? 0x71 : 0x4e))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const guard = (addr: number, length: number) => sha(stock.subarray(addr - LOAD, addr - LOAD + length))
const site = (addr: number, length: number, kind: 'code' | 'data' = 'code', extra: Partial<DeclaredSite> = {}): DeclaredSite => ({ addr, length, kind, stockSha256: guard(addr, length), owner: 'mod', ...extra })
const map: StockMap = { mainLoad: LOAD, imageLength: stock.length, protected: [[0x40000800, 0x40000900, 'a protected table']], tailBudget: 64, tailHook: 0x40000100 }
const hex = (text: string) => Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16))
/** `stock` with `bytes` written at `addr` and `tail` appended. */
function build(edits: [number, string][], tail = 0): Uint8Array {
  const out = new Uint8Array(stock.length + tail); out.set(stock)
  for (const [addr, text] of edits) out.set(hex(text), addr - LOAD)
  return out
}
const JMP = '4ef900000000', NOP = '4e71'

describe('stock-write checker', () => {
  it('finds the changed runs between two images', () => {
    expect(changedRanges(stock, stock)).toEqual([])
    expect(changedRanges(stock, build([[0x40000100, JMP + NOP], [0x40000200, '00']]))).toEqual([[0x101, 0x106], [0x200, 0x201]])
  })

  it('accepts a build that changes only declared code and appends a tail it can relocate', async () => {
    const built = build([[0x40000100, JMP + NOP]], 16)
    const report = await checkStockWrites(stock, built, map, [site(0x40000100, 8)])
    expect(report).toEqual({ changed: [[0x101, 0x106]], tail: 16, sites: 1 })
  })

  it('refuses a change outside every declared site', async () => {
    const built = build([[0x40000100, JMP + NOP], [0x40000300, '4e75']])
    await expect(checkStockWrites(stock, built, map, [site(0x40000100, 8)])).rejects.toThrow('0x40000301-0x40000302 change outside every declared site')
  })

  it('refuses a site whose guard does not match the stock bytes', async () => {
    const built = build([[0x40000100, JMP + NOP]])
    await expect(checkStockWrites(stock, built, map, [site(0x40000100, 8, 'code', { stockSha256: 'f'.repeat(64) })])).rejects.toThrow('not the ones it expects')
    await expect(checkStockWrites(stock, built, map, [site(0x40000100, 8, 'code', { stockSha256: 'nope' })])).rejects.toThrow('no guard')
  })

  it('refuses overlapping sites and sites inside a protected range', async () => {
    const built = build([[0x40000100, JMP + NOP]])
    await expect(checkStockWrites(stock, built, map, [site(0x40000100, 8), site(0x40000104, 4, 'data', { owner: 'other' })])).rejects.toThrow('mod site 0x40000100 and other site 0x40000104 overlap')
    await expect(checkStockWrites(stock, build([[0x40000100, JMP + NOP], [0x40000880, NOP]]), map, [site(0x40000100, 8), site(0x40000880, 2)])).rejects.toThrow('inside 0x40000800-0x40000900, a protected table')
  })

  it('refuses a tail over the budget or without the hook that relocates it', async () => {
    await expect(checkStockWrites(stock, build([[0x40000100, JMP + NOP]], 65), map, [site(0x40000100, 8)])).rejects.toThrow('65 bytes, over the 64 allowed')
    await expect(checkStockWrites(stock, build([[0x40000200, JMP + NOP]], 8), map, [site(0x40000200, 8)])).rejects.toThrow('declares no hook at 0x40000100')
    const report = await checkStockWrites(stock, build([[0x40000200, JMP + NOP]]), map, [site(0x40000200, 8)])
    expect(report.tail).toBe(0)
  })

  it('refuses code sites that are not whole instructions or that become PC-relative', async () => {
    await expect(checkStockWrites(stock, build([[0x40000100, '4ef9000000']]), map, [site(0x40000100, 5)])).rejects.toThrow('stock bytes are not whole instructions')
    await expect(checkStockWrites(stock, build([[0x40000100, '4ef90000000000']]), map, [site(0x40000100, 8)])).rejects.toThrow('new bytes are not whole instructions')
    await expect(checkStockWrites(stock, build([[0x40000100, '4eba0010' + NOP + NOP]]), map, [site(0x40000100, 8)])).rejects.toThrow('is PC-relative')
    const data = await checkStockWrites(stock, build([[0x40000100, '4ef9000000']]), map, [site(0x40000100, 5, 'data')])
    expect(data.sites).toBe(1)
  })

  it('reports every problem at once and refuses a map that does not match the stock image', async () => {
    const built = build([[0x40000100, JMP + NOP], [0x40000300, '4e75']], 100)
    const error = await checkStockWrites(stock, built, map, [site(0x40000200, 8)]).catch(e => e)
    expect(error).toBeInstanceOf(StockWriteError)
    expect(error.problems.length).toBe(4)
    await expect(checkStockWrites(stock, built, { ...map, imageLength: 1 }, [])).rejects.toThrow('not the 1 the map describes')
  })
})
