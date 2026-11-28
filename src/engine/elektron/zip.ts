// SPDX-License-Identifier: GPL-3.0-or-later
// Enough of the zip format to take a stock OS file out of the .zip Elektron publishes it in: the central directory,
// stored and deflated members (deflate through the platform's DecompressionStream) and the CRC-32 check, with
// Python's zipfile messages.

export class BadZipFile extends Error {}

export type ZipMember = { filename: string; method: number; flags: number; crc: number; compressedSize: number; fileSize: number; offset: number }

const u16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8)
const u32le = (d: Uint8Array, at: number) => (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0
const END_OF_DIRECTORY = 0x06054b50, DIRECTORY_ENTRY = 0x02014b50, LOCAL_HEADER = 0x04034b50

/** Code page 437 for bytes 0x80-0xff: a member name's encoding unless flag 11 says UTF-8. */
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

const memberName = (d: Uint8Array, utf8: boolean) => (utf8 ? new TextDecoder('utf-8').decode(d) : Array.from(d, b => (b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80])).join(''))

/** The members a zip's central directory lists. */
export function members(raw: Uint8Array): ZipMember[] {
  let end = -1
  for (let i = raw.length - 22; i >= Math.max(0, raw.length - 22 - 0xffff) && end < 0; i--) if (u32le(raw, i) === END_OF_DIRECTORY) end = i
  if (end < 0) throw new BadZipFile('File is not a zip file')
  const count = u16(raw, end + 10), size = u32le(raw, end + 12), start = u32le(raw, end + 16)
  if (start + size > end) throw new BadZipFile('Bad magic number for central directory')
  const list: ZipMember[] = []
  for (let k = 0, at = start; k < count; k++) {
    if (u32le(raw, at) !== DIRECTORY_ENTRY) throw new BadZipFile('Bad magic number for central directory')
    const flags = u16(raw, at + 8), nameLength = u16(raw, at + 28), extra = u16(raw, at + 30), comment = u16(raw, at + 32)
    list.push({
      filename: memberName(raw.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) !== 0), method: u16(raw, at + 10), flags,
      crc: u32le(raw, at + 16), compressedSize: u32le(raw, at + 20), fileSize: u32le(raw, at + 24), offset: u32le(raw, at + 42),
    })
    at += 46 + nameLength + extra + comment
  }
  return list
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(d: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of d) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function inflateRaw(d: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([d as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** One member's bytes, its CRC-32 checked. */
export async function read(raw: Uint8Array, m: ZipMember): Promise<Uint8Array> {
  if (m.flags & 1) throw new BadZipFile(`File '${m.filename}' is encrypted, password required for extraction`)
  if (u32le(raw, m.offset) !== LOCAL_HEADER) throw new BadZipFile('Bad magic number for file header')
  const start = m.offset + 30 + u16(raw, m.offset + 26) + u16(raw, m.offset + 28)
  const body = raw.subarray(start, start + m.compressedSize)
  let data: Uint8Array
  if (m.method === 0) data = body.slice()
  else if (m.method === 8) {
    try { data = await inflateRaw(body) } catch (e) { throw new BadZipFile('Error -3 while decompressing data: ' + (e as Error).message) }
  } else throw new BadZipFile('That compression method is not supported')
  if (crc32(data) !== m.crc) throw new BadZipFile(`Bad CRC-32 for file '${m.filename}'`)
  return data
}
