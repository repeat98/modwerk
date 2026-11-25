// SPDX-License-Identifier: GPL-3.0-or-later
// The Modwerk SysEx link's wire, shared by every machine that speaks it (the Analog Rytm MKII's format: the Digitone II
// in dn2-link.ts, the Model:Cycles in mc-link.ts): the header, a request, a reply, a request and its reply over a line,
// and the 7-bit numbers and byte blocks. A request is F0 7D 'M' 'W' 'L' version, a sequence byte, the command, its body
// and F7; the reply carries the same sequence, the command with 0x40 set, a status byte (0 = ok) and a payload. Each
// machine keeps its own command table and status wording; nothing here names a machine.

/** F0 7D 'M' 'W' 'L' version: the link's header, a request's and a reply's. */
export const LINK_HEADER = [0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1] as const

/** SysEx in and out: whole messages, F0 to F7. next() waits up to `ms` and gives null when none came. */
export type LinkLine = { send(data: Uint8Array): void; next(ms: number): Promise<Uint8Array | null> }
export class LinkError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

/** A u32 as five 7-bit bytes, least significant first. */
export function u32(value: number): number[] {
  return Array.from({ length: 5 }, (_, i) => Math.floor(value / 2 ** (7 * i)) & 0x7f)
}
export function get32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | bytes[at + 1] << 7 | bytes[at + 2] << 14 | bytes[at + 3] << 21) + (bytes[at + 4] & 0x0f) * 2 ** 28
}
/** The link's byte blocks: groups of up to seven, each led by a byte holding their top bits (the first's in bit 6). */
export function unpack7(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 8) {
    const top = bytes[i]
    bytes.subarray(i + 1, i + 8).forEach((byte, k) => out.push(byte | (top & 0x40 >> k ? 0x80 : 0)))
  }
  return Uint8Array.from(out)
}
/** link.c's byte blocks from bytes: groups of up to seven, each led by a byte holding their top bits. */
export function pack7(data: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.subarray(i, i + 7)
    out.push(chunk.reduce((top, b, k) => top | (b & 0x80 ? 0x40 >> k : 0), 0), ...Array.from(chunk, b => b & 0x7f))
  }
  return out
}

/** A request: header, sequence, command, body (already 7-bit), F7. */
export function linkFrame(seq: number, command: number, body: readonly number[] = []): Uint8Array {
  return Uint8Array.from([...LINK_HEADER, seq & 0x7f, command, ...body, 0xf7])
}
/** A reply's sequence, command, status and payload; null for anything that is not one (a request echoed back included). */
export function parseLinkReply(message: Uint8Array): { seq: number; command: number; status: number; payload: Uint8Array } | null {
  if (message.length < LINK_HEADER.length + 4 || message.at(-1) !== 0xf7 || LINK_HEADER.some((b, i) => message[i] !== b) || !(message[7] & 0x40)) return null
  return { seq: message[6], command: message[7] & 0x3f, status: message[8], payload: message.subarray(9, -1) }
}

/** Send request `seq` and wait up to `timeoutMs` for its reply, passing over any other message: its status and
 * payload, or null when none came. */
export async function linkExchange(line: LinkLine, seq: number, command: number, body: readonly number[], timeoutMs: number): Promise<{ status: number; payload: Uint8Array } | null> {
  line.send(linkFrame(seq, command, body))
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    const message = await line.next(Math.max(1, end - Date.now()))
    if (!message) break
    const reply = parseLinkReply(message)
    if (reply && reply.seq === (seq & 0x7f) && reply.command === command) return reply
  }
  return null
}

export type LinkAsk = { timeoutMs?: number; label?: string; status?: Readonly<Record<number, string>> }
let nextSeq = 0
/** One request and its payload; throws a LinkError on a refusal (worded from `status`) or no answer. */
export async function askLink(line: LinkLine, command: number, body: readonly number[] = [], { timeoutMs = 2000, label, status = {} }: LinkAsk = {}): Promise<Uint8Array> {
  const name = label ?? 'command 0x' + command.toString(16).padStart(2, '0')
  const reply = await linkExchange(line, nextSeq = (nextSeq + 1) & 0x7f, command, body, timeoutMs)
  if (!reply) throw new LinkError(`${name}: no answer. Is a Modwerk base with the link on the unit?`)
  if (reply.status) throw new LinkError(`${name}: ${status[reply.status] ?? 'status ' + reply.status}`, reply.status)
  return reply.payload
}
