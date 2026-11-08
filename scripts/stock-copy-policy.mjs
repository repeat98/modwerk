// SPDX-License-Identifier: Elastic-2.0
// Which stock copies a requested card package may carry (scripts/import-module-build.mjs). A copy is a zero
// placeholder the builder fills from the user's verified OS at build time, matched by address, length and SHA-256,
// so no stock byte is in the package. Two kinds are admitted:
//   - replay spans: the four of USB MIDI's descriptor package and of VECTOR's and POLY8's replaying units, each
//     the guarded span of a detour of the same group (USB MIDI: its 23-byte descriptor);
//   - data copies: any other package's copies, each a guard its module's import record declares under stockGuards
//     with kind guarded-local-cpu-read, so a reviewer sees every span a module reads from the OS.

export const REPLAY_LABELS = Object.freeze(['usbmidi_cfg', 'vector', 'polyui'])

/** Throws unless every stock copy of `pkg` is admitted. `group` is the package's requested group; `guards` the
 *  stockGuards of the import record of its module at its version. */
export function checkRequestedStockCopies(pkg, group, guards = []) {
  const copies = pkg.stockCopies
  if (!Array.isArray(copies)) throw new Error('Invalid inherited stock placeholder inventory')
  if (REPLAY_LABELS.includes(pkg.label)) {
    if (copies.length !== 4) throw new Error('Invalid inherited stock placeholder inventory')
    for (const copy of copies) {
      if (pkg.label === 'usbmidi_cfg') {
        if (copy.bytes !== 23) throw new Error('Invalid inherited USB descriptor length')
      } else if (!group?.detours?.some(hook => hook.address === copy.source && hook.guardLength === copy.bytes && hook.guardSha256 === copy.sha256)) {
        throw new Error('Inherited replay span must match its declared native detour guard')
      }
    }
    return
  }
  for (const copy of copies) {
    if (!guards.some(guard => guard.kind === 'guarded-local-cpu-read' && guard.address === copy.source && guard.bytes === copy.bytes && guard.sha256 === copy.sha256)) {
      throw new Error('A stock data copy must match a guard its import record declares')
    }
  }
}
