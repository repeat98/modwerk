// SPDX-License-Identifier: GPL-3.0-or-later
// Does stock code enter a patched site anywhere but at its first byte? A detour replaces a span of instructions and
// replays them elsewhere. A stock branch, call or table pointer to an instruction after the first then lands inside
// the detour's jump (docs/OCTATRACK_HARDWARE_TRAPS.md, "Stock can branch into the middle of a span"). This lists
// every such entry the image shows. It is a floor, never a proof: a target computed at run time is not seen.
// Machine-independent: the caller gives the main OS image, its load address and the sites.
import { decodeColdFire, readerAt, wholeInstructions, ILLEGAL, LINEF } from './coldfire-isa.ts'

export type CodeSite = { addr: number; length: number; owner: string }
/** `branch`: a stock branch, jump or call. `pointer`: a 2-aligned longword holding the address (a jump table, a
 * vector, a function pointer). */
export type Entry = { site: CodeSite; target: number; from: number; how: 'branch' | 'pointer'; flow: string }

/** Every entry into the interior of a site, sorted by site then target then source. Only a target where one of the
 * site's own stock instructions starts counts, and only a source that is an instruction itself: one the linear sweep
 * from the image's start reaches, or one that sweeps started just before it all land on. A word that reads as a branch
 * only out of step is an operand or data. A source inside the site is left out: the patch replaces it too. */
export function inboundBranches(image: Uint8Array, base: number, sites: readonly CodeSite[]): Entry[] {
  const wanted = sites.filter(site => site.length > 2 && site.addr >= base && site.addr + site.length <= base + image.length).sort((a, b) => a.addr - b.addr)
  if (!wanted.length) return []
  // A site's interior holds few instruction starts: index them, so each decoded target costs one lookup.
  const interior = new Map<number, CodeSite[]>()
  for (const site of wanted) {
    for (let pc = site.addr; pc < site.addr + site.length;) {
      if (pc > site.addr) interior.set(pc, [...(interior.get(pc) ?? []), site])
      pc += Math.max(2, decodeColdFire(readerAt(image, base)(pc), pc).length)
    }
  }
  const at = readerAt(image, base), end = base + image.length, entries: Entry[] = []
  const inStep = new Set<number>()
  for (let pc = base; pc + 1 < end;) {
    inStep.add(pc)
    const ins = decodeColdFire(at(pc), pc)
    pc += Math.max(2, ins.length)
  }
  for (let pc = base; pc + 1 < end; pc += 2) {
    const ins = decodeColdFire(at(pc), pc)
    if (ins.target !== undefined && !(ins.flags & (ILLEGAL | LINEF))) {
      const hit = (interior.get(ins.target >>> 0) ?? []).filter(site => pc < site.addr || pc >= site.addr + site.length)
      if (hit.length && (inStep.has(pc) || wholeInstructions(image, base, pc, ins.length).ok))
        for (const site of hit) entries.push({ site, target: ins.target >>> 0, from: pc, how: 'branch', flow: ins.flow })
    }
    if (pc + 3 < end) {
      const i = pc - base, word = (image[i] << 24 | image[i + 1] << 16 | image[i + 2] << 8 | image[i + 3]) >>> 0
      // A branch or call already reported at this or the previous word carries the address as its operand.
      const operand = entries.some(entry => entry.how !== 'pointer' && entry.target === word && (entry.from === pc - 2 || entry.from === pc))
      if (!operand) for (const site of interior.get(word) ?? []) entries.push({ site, target: word, from: pc, how: 'pointer', flow: 'pointer' })
    }
  }
  return entries.sort((a, b) => a.site.addr - b.site.addr || a.target - b.target || a.from - b.from)
}
