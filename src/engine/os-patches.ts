export const OS_LOAD_ADDRESS = 0x40000400
export type OsWrite = { address: number; guardLength: number; guardSha256: string; bytes: Uint8Array; note: string }
// The zero run 0x400d24d0..0x400d2ce0 is entries 508..1023 of the stock DELAY's filter table (0x400d1ce0): the defaults read
// entry 508, higher BASE + WDTH up to 1016, the boot init 1023 (docs/OCTATRACK_HARDWARE_TRAPS.md; build_bus.py). No cave,
// overflow placement or patch may write 0x400d24d0..0x400d2ca7; the last 56 bytes are Scale Quantizer's pinned units.
export const DELAY_TABLE_TAIL = 0x400d24d0, DELAY_TABLE_TAIL_END = 0x400d2ca8
export const DELAY_TABLE_TAIL_REFUSAL = 'the stock DELAY reads 0x400d24d0..0x400d2ca7 as its filter table, so those bytes stay stock'
export function writesDelayTableTail(address: number, length: number) {
  return address < DELAY_TABLE_TAIL_END && DELAY_TABLE_TAIL < address + length
}

// Validate every extent and guard before copying or writing the local image.
// An error cannot leave a half-patched image for a later build to consume.
// `authorSpans`: runs a pinned author image already wrote into `original` (only MIDI Scenes passes its recipe's). A write whose
// guard lies wholly inside one replaces the author's bytes, not the DELAY's, so the table check lets it through.
export async function applyGuardedOsWrites(original: Uint8Array, writes: readonly OsWrite[], authorSpans: readonly { address: number; bytes: number }[] = []): Promise<Uint8Array> {
  if (!original.length || original.length > 16 * 1024 * 1024 || writes.length > 4096) throw new Error('The OS write plan has invalid bounds.')
  const ordered = [...writes].sort((a, b) => a.address - b.address)
  let previousEnd = OS_LOAD_ADDRESS
  for (const write of ordered) {
    const offset = write.address - OS_LOAD_ADDRESS
    if (!Number.isInteger(write.address) || !Number.isInteger(write.guardLength) || offset < 0 || write.guardLength < 1 || write.bytes.length < 1 || write.bytes.length > write.guardLength || offset + write.guardLength > original.length || !/^[0-9a-f]{64}$/.test(write.guardSha256)) throw new Error('The OS write plan has an invalid guarded range.')
    if (write.address < previousEnd) throw new Error('The OS write plan contains overlapping guards.')
    if (writesDelayTableTail(write.address, write.bytes.length) && !authorSpans.some(span => write.address >= span.address && write.address + write.guardLength <= span.address + span.bytes)) throw new Error(write.note + ' would change ' + DELAY_TABLE_TAIL_REFUSAL + '.')
    previousEnd = write.address + write.guardLength
  }
  for (const write of ordered) {
    const offset = write.address - OS_LOAD_ADDRESS
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(original.subarray(offset, offset + write.guardLength)).buffer)
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== write.guardSha256) throw new Error('The original OS does not match the guard for ' + write.note + '.')
  }
  const result = new Uint8Array(original)
  for (const write of ordered) result.set(write.bytes, write.address - OS_LOAD_ADDRESS)
  return result
}
