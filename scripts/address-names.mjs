// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Names for the addresses a crash record holds, so a program counter reads as a function instead of eight hex digits.
// Two sources, both on this computer only:
//   - each base built or RAM-booted here: build_core.py's symbols.json (the base's functions and data, and the stock
//     addresses its source names), kept by `octatrack:base -- --out DIR` and `device -- boot DIR` under the base's identity;
//   - your own notes on stock addresses: ~/.cache/modwerk-local/octatrack/addresses.json, {"0x4005a2b8": "popup", ...}.
// Neither is committed: a map of the stock OS is made from the OS file, like the firmware it describes.
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = join(homedir(), '.cache/modwerk-local/octatrack')
const NEAR = 0x1000 // a name reaches this far past its address: further on, the nearest name below says nothing

/** `name(address)`: "symbol+0x1c", or '' when nothing is named within NEAR below it. Addresses outside main memory
 * (0x40000000-0x40ffffff: absolute constants, registers) are no code or data and are left out. */
export function addressNames(symbols = {}, notes = {}) {
  const at = new Map()
  for (const [name, address] of Object.entries(symbols)) // the linker lists each symbol twice, once as "core:name"
    if (address >= 0x40000000 && address < 0x41000000 && (!at.has(address) || !name.startsWith('core:'))) at.set(address, name.replace(/^core:/, ''))
  for (const [address, name] of Object.entries(notes)) at.set(Number(address), name)
  const sorted = [...at].sort((a, b) => a[0] - b[0])
  return address => {
    let low = 0, high = sorted.length
    while (low < high) { const mid = low + high >> 1; if (sorted[mid][0] <= address) low = mid + 1; else high = mid }
    const found = sorted[low - 1]
    return found && address - found[0] < NEAR ? found[1] + (address === found[0] ? '' : '+0x' + (address - found[0]).toString(16)) : ''
  }
}

/** Keep a build's symbols under its base's identity (proofs.json's configurationHash), for later crash records. */
export function keepSymbols(dir, home = HOME) {
  const base = JSON.parse(readFileSync(join(dir, 'proofs.json'), 'utf8')).configurationHash
  mkdirSync(join(home, 'symbols'), { recursive: true })
  copyFileSync(join(dir, 'symbols.json'), join(home, 'symbols', base + '.json'))
}

/** The names for a base, by its identity or the first hex digits of it (a log's base record holds eight): undefined
 * when no build of that base was kept here, so an address is never named from another base's layout. */
export function namesFor(base, home = HOME) {
  const read = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return undefined } }
  let file
  try { file = base && readdirSync(join(home, 'symbols')).find(name => name.startsWith(base)) } catch { /* none kept */ }
  return file ? addressNames(read(join(home, 'symbols', file)), read(join(home, 'addresses.json'))) : undefined
}

/** " (name+0x1c)" for a line that already prints the address, or ''. */
export const withName = (names, address) => { const name = names?.(address); return name ? ` (${name})` : '' }
/** A crash record's line of names: where the program counter was and the stack longs that point at something named
 * (return addresses among them, and data), in the stack's order; '' without names for its base. */
export function crashNames(names, pc, stack) {
  if (!names) return ''
  const through = stack.map(names).filter(Boolean)
  return `in ${names(pc) || 'nothing named'}` + (through.length ? ', stack holds ' + through.join(', ') : '')
}
