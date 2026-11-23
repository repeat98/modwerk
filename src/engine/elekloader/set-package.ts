// SPDX-License-Identifier: GPL-3.0-or-later
// MWMS v1 and v2, sdk/runtime/loader/set_package.h. One offer and one Keep for all changes.
import { digestBytes, UPLOAD_MAX_BYTES } from './upload-wire.ts'
import { sha256 } from '../../../vendor/elekloader/kit/src/bytes.ts'
import frameCosts from '../../../sdk/machines/octatrack/frame-costs.json' with { type: 'json' }

/** v2's table entry: a module's package id and what it adds to the longest frame, per mille: each further instance
 * (`use`), on top for the Part's first (`wake`), and installed on no track or slot (`rest`). */
export interface FrameCost { module: number; use: number; wake: number; rest: number }
/** The base's own figures travel as these pseudo module ids (status.c), after every package id: a sample track's share,
 * the line, the stock reserve for a pattern whose busiest step trigs 0 to 8 tracks, the reserve's margin and its floor,
 * what each further track that trigs off that step adds, and the margin on a pattern's own measured stock. */
export const STOCK_IDS = { trackStock: 0xfffffff1, line: 0xfffffff2, reserveBySteps: 0xfffffff3, reserveMargin: 0xfffffffc, reserveFloor: 0xfffffffd, trackPlay: 0xfffffffe, measuredMargin: 0xffffffff } as const
type Stock = { trackStock: number; line: number; reserveBySteps: readonly number[]; reserveMargin: number; reserveFloor: number; trackPlay: number; measuredMargin: number }
/** The measured costs (sdk/machines/octatrack/frame-costs.json, percent: `first` alone, `each` further, `rest` installed
 * and unused, and the base's `stock`) as v2 sends them, by id ascending. */
export function frameCostTable(costs: Record<string, { first: number; each: number; rest?: number }> = frameCosts.costs, stock: Stock | null = frameCosts.stock): FrameCost[] {
  const modules = Object.entries(costs).map(([id, cost]) => ({
    module: new DataView(sha256(new TextEncoder().encode(id)).buffer).getUint32(0), // build.py module_id()
    use: Math.round(cost.each * 10), wake: Math.max(0, Math.round(cost.first * 10) - Math.round(cost.each * 10)),
    rest: Math.max(0, Math.round((cost.rest ?? 0) * 10)),
  }))
  if (modules.some(m => m.module >= 0xfffffff0)) throw new Error('A module id collides with the base\'s own figures.') // 0xfffffff0 and up are the base's
  if (stock && stock.reserveBySteps.length !== 9) throw new Error('The stock reserve needs a figure for 0 to 8 tracks on a step.')
  const own = stock ? [
    { module: STOCK_IDS.trackStock, use: Math.round(stock.trackStock * 10), wake: 0, rest: 0 },
    { module: STOCK_IDS.line, use: Math.round(stock.line * 10), wake: 0, rest: 0 },
    ...stock.reserveBySteps.map((figure, n) => ({ module: STOCK_IDS.reserveBySteps + n, use: Math.round(figure * 10), wake: 0, rest: 0 })),
    { module: STOCK_IDS.reserveMargin, use: Math.round(stock.reserveMargin * 10), wake: 0, rest: 0 },
    { module: STOCK_IDS.reserveFloor, use: Math.round(stock.reserveFloor * 10), wake: 0, rest: 0 },
    { module: STOCK_IDS.trackPlay, use: Math.round(stock.trackPlay * 10), wake: 0, rest: 0 },
    { module: STOCK_IDS.measuredMargin, use: Math.round(stock.measuredMargin * 10), wake: 0, rest: 0 },
  ] : []
  return [...modules.sort((a, b) => a.module - b.module), ...own]
}
/** set_package.h RUNTIME_SET_COSTS. */
export const SET_COSTS = 128

/** set_package.h RUNTIME_SET_CHANGES and journal.h RUNTIME_JOURNAL_ROWS: the Octatrack base's 128 installed modules. */
export const SET_CHANGES = 128
/** The newest package ABI the base's set parser takes (loader.h RUNTIME_ABI, set_package.h). */
export const SET_MAX_ABI = 10
/** `costs`: v2, for a base with RuntimeFeature.frameCosts; without, v1. */
export function encodeModuleSet(base: string, baseline: string, packages: readonly Uint8Array[], costs?: readonly FrameCost[]): Uint8Array {
  const baseBytes = digestBytes(base), baselineBytes = digestBytes(baseline)
  if (!packages.length || packages.length > SET_CHANGES) throw new Error(`A module set needs between 1 and ${SET_CHANGES} changes.`)
  const ids = new Set<number>()
  let bytes = 80
  for (const data of packages) {
    if (data.length < 32) throw new Error('A module package is incomplete.')
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength), id = view.getUint32(28)
    if (view.getUint32(0) !== 0x4d57524d || view.getUint16(4) < 4 || view.getUint16(4) > SET_MAX_ABI || !id || ids.has(id))
      throw new Error('A module set contains an invalid or repeated module.')
    ids.add(id); bytes += 4 + Math.ceil(data.length / 4) * 4
    if (bytes > UPLOAD_MAX_BYTES) throw new Error('The module set exceeds the upload limit.')
  }
  if (costs) {
    if (costs.length > SET_COSTS || costs.some((c, i) => !(c.module > (i ? costs[i - 1].module : 0)) || c.module > 0xffffffff ||
        ![c.use, c.wake, c.rest].every(n => Number.isInteger(n) && n >= 0 && n <= 2000)))
      throw new Error('The module set\'s frame costs are invalid.')
    bytes += 4 + 12 * costs.length
    if (bytes > UPLOAD_MAX_BYTES) throw new Error('The module set exceeds the upload limit.')
  }
  const data = new Uint8Array(bytes), view = new DataView(data.buffer)
  view.setUint32(0, 0x4d574d53); view.setUint16(4, costs ? 2 : 1); view.setUint16(6, packages.length); view.setUint32(8, bytes)
  data.set(baseBytes, 16); data.set(baselineBytes, 48)
  let at = 80
  for (const pkg of packages) { view.setUint32(at, pkg.length); data.set(pkg, at + 4); at += 4 + Math.ceil(pkg.length / 4) * 4 }
  if (costs) {
    view.setUint32(at, costs.length); at += 4
    for (const c of costs) { view.setUint32(at, c.module); view.setUint16(at + 4, c.use); view.setUint16(at + 6, c.wake); view.setUint16(at + 8, c.rest); at += 12 }
  }
  return data
}

export function parseSetIdentity(view: DataView): string {
  if (view.byteLength !== 40 || view.getUint32(0) !== 0x4d575344 || view.getUint8(4) !== 1 || view.getUint8(5) !== 1 || view.getUint16(6) > SET_CHANGES)
    throw new Error('The Octatrack could not confirm its complete installed module set.')
  const bytes = new Uint8Array(view.buffer, view.byteOffset + 8, 32)
  if (bytes.every(byte => byte === 0)) throw new Error('The installed module-set identity is unknown.')
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
