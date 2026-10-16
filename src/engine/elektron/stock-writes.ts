// SPDX-License-Identifier: GPL-3.0-or-later
// Stock-write checker: a built main OS image may differ from the owner's stock image only inside declared, guarded
// patch sites and in an appended tail. Everything is decided from the two images and the declarations; no firmware is
// embedded here and nothing runs on a unit.
import { PCREL, decodeColdFire, readerAt, wholeInstructions } from './coldfire-isa.ts'
import { sha256Hex } from './hash.ts'

export class StockWriteError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) { super('the build writes stock bytes it may not:\n  ' + problems.join('\n  ')); this.problems = problems }
}

/** One place a build is allowed to change: whole instructions (`code`) or bytes (`data`) at a guarded stock address. */
export type DeclaredSite = { addr: number; length: number; kind: 'code' | 'data'; stockSha256: string; owner: string }

export type StockMap = {
  mainLoad: number
  imageLength: number
  /** Ranges no site may touch, with the reason shown in the refusal. */
  protected: [number, number, string][]
  /** The appended tail may not exceed this many bytes. */
  tailBudget: number
  /** When the tail is not empty, one declared site must be at this address: the hook that moves the tail out of the way. */
  tailHook: number | null
}

export type StockWriteReport = { changed: [number, number][]; tail: number; sites: number }

const hex32 = (value: number) => '0x' + value.toString(16).padStart(8, '0')

/** The maximal runs of [from, to) where `built` differs from `stock` within the stock image. */
export function changedRanges(stock: Uint8Array, built: Uint8Array): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i < stock.length; i++) {
    const same = i < built.length && built[i] === stock[i]
    if (!same && start < 0) start = i
    if (same && start >= 0) { out.push([start, i]); start = -1 }
  }
  if (start >= 0) out.push([start, stock.length])
  return out
}

/**
 * Refuses unless every changed byte of `built` lies inside a declared site whose guard matches `stock`, the sites are
 * disjoint, outside the protected ranges and whole instructions where they are code, and the appended tail stays within
 * the budget and has its hook. Returns the changed ranges and the tail length.
 */
export async function checkStockWrites(stock: Uint8Array, built: Uint8Array, map: StockMap, sites: DeclaredSite[]): Promise<StockWriteReport> {
  const problems: string[] = []
  if (stock.length !== map.imageLength) problems.push('the stock image is ' + stock.length + ' bytes, not the ' + map.imageLength + ' the map describes')
  if (built.length < stock.length) problems.push('the build is shorter than stock (' + built.length + ' < ' + stock.length + ')')
  const sorted = [...sites].sort((a, b) => a.addr - b.addr || a.length - b.length)
  for (const site of sorted) {
    const offset = site.addr - map.mainLoad, label = site.owner + ' site ' + hex32(site.addr)
    if (site.length <= 0 || offset < 0 || offset + site.length > stock.length) { problems.push(label + ': outside the stock image'); continue }
    if (!/^[a-f0-9]{64}$/.test(site.stockSha256)) { problems.push(label + ': no guard'); continue }
    if (await sha256Hex(stock.subarray(offset, offset + site.length)) !== site.stockSha256) problems.push(label + ': the stock bytes are not the ones it expects')
    for (const [lo, hi, why] of map.protected) if (site.addr < hi && lo < site.addr + site.length) problems.push(label + ': inside ' + hex32(lo) + '-' + hex32(hi) + ', ' + why)
    if (site.kind === 'code') {
      const before = wholeInstructions(stock, map.mainLoad, site.addr, site.length)
      if (!before.ok) problems.push(label + ': stock bytes are not whole instructions (' + before.note + ')')
      if (built.length >= offset + site.length) {
        const after = wholeInstructions(built, map.mainLoad, site.addr, site.length, 0)
        if (!after.ok) problems.push(label + ': new bytes are not whole instructions (' + after.note + ')')
        else {
          const read = readerAt(built, map.mainLoad)
          for (let at = site.addr; at < site.addr + site.length;) {
            const instruction = decodeColdFire(read(at), at)
            if (instruction.flags & PCREL) problems.push(label + ': ' + instruction.op + ' at ' + hex32(at) + ' is PC-relative')
            at += instruction.length
          }
        }
      }
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1], site = sorted[i]
    if (site.addr < previous.addr + previous.length) problems.push(previous.owner + ' site ' + hex32(previous.addr) + ' and ' + site.owner + ' site ' + hex32(site.addr) + ' overlap')
  }
  const changed = changedRanges(stock, built)
  for (const [from, to] of changed) {
    const lo = map.mainLoad + from, hi = map.mainLoad + to
    if (!sorted.some(site => site.addr <= lo && hi <= site.addr + site.length)) problems.push('stock bytes ' + hex32(lo) + '-' + hex32(hi) + ' change outside every declared site')
  }
  const tail = Math.max(0, built.length - stock.length)
  if (tail > map.tailBudget) problems.push('the appended tail is ' + tail + ' bytes, over the ' + map.tailBudget + ' allowed')
  if (tail > 0 && map.tailHook !== null && !sorted.some(site => site.addr === map.tailHook)) problems.push('the build appends ' + tail + ' bytes but declares no hook at ' + hex32(map.tailHook) + ' to move them before the OS clears that memory')
  if (problems.length) throw new StockWriteError(problems)
  return { changed, tail, sites: sorted.length }
}
