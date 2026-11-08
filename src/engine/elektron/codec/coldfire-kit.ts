// SPDX-License-Identifier: GPL-3.0-or-later
// The ColdFire classifier with the kit's API: its op names, and an unreadable FPU EA extension word
// falls back to linef like any other unreadable extension word.
import { decode, wholeInstructions } from './coldfire.ts'
import type { Instruction, Read16, Variant } from './coldfire.ts'
export { FPU, LINEF, ILLEGAL, PRIV, MOVEC, EMAC_OP, PCREL, readerAt } from './coldfire.ts'
export type { Flow, Instruction, Read16 } from './coldfire.ts'

const KIT: Variant = { ops: 'kit', fpuReadFailure: 'fallback' }

export function decodeColdFire(read16: Read16, addr = 0): Instruction {
  return decode(KIT, read16, addr)
}

export function wholeInstructionsAt(image: Uint8Array, base: number, addr: number, n: number, sweeps = 32): { ok: boolean; note: string } {
  return wholeInstructions(KIT, image, base, addr, n, sweeps)
}
