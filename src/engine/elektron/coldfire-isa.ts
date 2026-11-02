// SPDX-License-Identifier: GPL-3.0-or-later
// The ColdFire classifier with Modwerk's API: bitop and btsti name the bit ops, and an FPU word whose
// EA extension cannot be read keeps a shortened fpu length.
import { decode, wholeInstructions as whole } from './codec/coldfire.ts'
import type { Instruction, Read16, Variant } from './codec/coldfire.ts'
export { FPU, LINEF, ILLEGAL, PRIV, MOVEC, EMAC_OP, PCREL, readerAt } from './codec/coldfire.ts'
export type { Flow, Instruction, Read16 } from './codec/coldfire.ts'

const MODWERK: Variant = { ops: 'modwerk', fpuReadFailure: 'shorten' }

export function decodeColdFire(read16: Read16, addr = 0): Instruction {
  return decode(MODWERK, read16, addr)
}

export function wholeInstructions(image: Uint8Array, base: number, addr: number, n: number, sweeps = 32): { ok: boolean; note: string } {
  return whole(MODWERK, image, base, addr, n, sweeps)
}
