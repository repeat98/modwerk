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

/** The file in a zip whose name ends with `suffix` (stored or deflated), or undefined: how Zoom's updater download is read. */
export async function zipEntry(zip: Uint8Array, suffix: string): Promise<Uint8Array | undefined> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength), decoder = new TextDecoder()
  let end = zip.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('This isn’t a zip file.')
  for (let at = view.getUint32(end + 16, true), n = view.getUint16(end + 10, true); n > 0; n--) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('This zip is damaged.')
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), length = view.getUint16(at + 28, true)
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + length)), local = view.getUint32(at + 42, true)
    at += 46 + length + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    if (!name.endsWith(suffix)) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = zip.subarray(start, start + size)
    if (method === 0) return data
    if (method !== 8) throw new Error(name + ' is packed in a way this page can’t read.')
    return new Uint8Array(await new Response(new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
  }
}
