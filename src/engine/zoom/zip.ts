import { crc32 } from './zoom-protocol'

/** A zip of stored (uncompressed) files: the pedal backup. Effect files barely compress, so none is attempted. */
export function storedZip(entries: { name: string; data: ArrayLike<number> }[]): Blob {
  const parts: BlobPart[] = [], central: number[] = [], encoder = new TextEncoder()
  const u16 = (v: number) => [v & 255, (v >> 8) & 255], u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]
  let offset = 0
  for (const { name, data } of entries) {
    const n = Array.from(encoder.encode(name)), c = crc32(data)
    const common = [...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0)]
    const local = [0x50, 0x4b, 3, 4, ...common, ...n]
    parts.push(new Uint8Array(local), new Uint8Array(Array.from(data)))
    central.push(0x50, 0x4b, 1, 2, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n)
    offset += local.length + data.length
  }
  parts.push(new Uint8Array(central), new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(offset), 0, 0]))
  return new Blob(parts, { type: 'application/zip' })
}
