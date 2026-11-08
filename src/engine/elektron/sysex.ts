// SPDX-License-Identifier: GPL-3.0-or-later
// The SysEx transport of a Digitakt / Digitone mk1 OS file: reading its messages back. The encoders are Modwerk's own
// codec (codec/transport.ts). No firmware content is embedded here.
export { contentChecksum, encode8in7, encodeSyx, packetChecksum } from './codec/transport.ts'

export const MANUFACTURER = [0x00, 0x20, 0x3c] as const
export const FIRST_COUNTER = 242
export const CHUNK_SIZE = 101 // decoded bytes carried by one 128-byte data message
export const DATA_MESSAGE_SIZE = 128
export const FRAMING_MESSAGE_SIZE = 16

/** Raw .syx bytes -> its messages, each from F0 to F7 inclusive. */
export function splitMessages(raw: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = []
  for (let start = 0; start < raw.length;) {
    if (raw[start] !== 0xf0) throw new Error('Byte ' + start + ' does not start a SysEx message.')
    const end = raw.indexOf(0xf7, start)
    if (end < 0) throw new Error('The SysEx message at byte ' + start + ' has no end.')
    messages.push(raw.subarray(start, end + 1))
    start = end + 1
  }
  return messages
}

/** Data messages -> the decoded stream: each payload (bytes 10..125) is 8-in-7 encoded. */
export function decodeDataMessages(messages: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(messages.length * CHUNK_SIZE)
  let size = 0
  for (const message of messages) {
    const payload = message.subarray(10, 126)
    for (let k = 0; k < payload.length;) {
      const marker = payload[k++]
      for (let n = 0; n < 7 && k < payload.length; n++) output[size++] = payload[k++] | ((marker >> (6 - n)) & 1 ? 0x80 : 0)
    }
  }
  return output.slice(0, size)
}

export function framingCount(message: Uint8Array): number { return (message[12] << 14) | (message[13] << 7) | message[14] }

export function withFramingCount(message: Uint8Array, count: number): Uint8Array {
  const result = message.slice()
  result[12] = (count >> 14) & 0x7f; result[13] = (count >> 7) & 0x7f; result[14] = count & 0x7f
  return result
}
