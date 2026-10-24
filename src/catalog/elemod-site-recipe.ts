// SPDX-License-Identifier: GPL-3.0-or-later
// Emit only authored instructions/data. keep2 still requires verified local stock.
import { decodeColdFire, readerAt, ILLEGAL, LINEF, FPU } from '../engine/elektron/coldfire-isa.ts'
import { parseElemodSite } from './module-contract-v3.ts'

export function explicitSite(value: unknown) {
  const site = parseElemodSite(value)
  const guard = { addr: site.addr, len: site.len, stock_sha256: site.stockSha256 }
  if (site.op === 'keep2') throw new Error('Stock-dependent operations must remain local: keep2')
  if (site.op === 'bytes') {
    if (site.kind === 'code') {
      const bytes = Uint8Array.from(site.new.match(/../g)!, byte => parseInt(byte, 16)), base = Number(site.addr), starts: number[] = []
      for (let offset = 0; offset < bytes.length;) {
        const instruction = decodeColdFire(readerAt(bytes, base)(base + offset), base + offset)
        if (instruction.flags & (ILLEGAL | LINEF | FPU) || instruction.length < 2 || offset + instruction.length > bytes.length) throw new Error('Authored code patch must contain whole supported instructions')
        starts.push(offset); offset += instruction.length
      }
      // An address may only fill one instruction's extension words, never its opcode word or the next instruction.
      for (const { at } of site.relocs ?? []) {
        const next = starts.findIndex(offset => offset > at), end = next < 0 ? bytes.length : starts[next]
        if (starts.includes(at) || at + 4 > end) throw new Error('Authored code relocation must lie inside one instruction’s extension words')
      }
    }
    return { ...guard, new: site.new, kind: site.kind, relocs: (site.relocs ?? []).map(({ at, target }) => [at, 'abs32', 'sym:' + target, 0]) }
  }
  const bytes = new Uint8Array(site.len), view = new DataView(bytes.buffer)
  if (site.op !== 'ptr') {
    view.setUint16(0, site.op === 'lea' ? 0x41f9 | site.register << 9 : site.op === 'jsr' ? 0x4eb9 : 0x4ef9)
    for (let i = 6; i < site.len; i += 2) view.setUint16(i, 0x4e71)
  }
  return { ...guard, new: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), kind: site.op === 'ptr' ? 'data' : 'code', relocs: [[site.op === 'ptr' ? 0 : 2, 'abs32', 'sym:' + site.target, 0]] }
}
