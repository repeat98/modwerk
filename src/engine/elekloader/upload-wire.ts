// SPDX-License-Identifier: GPL-3.0-or-later
// Browser-native peer of sdk/runtime/upload/wire.c. No device access here.
export const UPLOAD_VERSION = 1
export const UPLOAD_HEADER = 48
export const UPLOAD_RESPONSE = 144
export const UPLOAD_MAX_CHUNK = 4096
export const UPLOAD_MAX_BYTES = 2097152 // sdk/runtime/upload/upload.h MU_MAX_BYTES: a whole OS image fits
export const UPLOAD_MAX_FRAME = UPLOAD_HEADER + 4 + UPLOAD_MAX_CHUNK
// What a client sends per chunk: the frame fits one 4 KiB control transfer. WinUSB, and with it WebUSB on Windows,
// refuses longer ones ("Invalid parameter"); macOS and Linux do not.
export const UPLOAD_CHUNK = 4096 - UPLOAD_HEADER - 4
export const UploadCommand = Object.freeze({
  hello: 0, enter: 1, begin: 2, chunk: 3, verify: 4, commit: 5,
  accept: 6, rollback: 7, abort: 8, leave: 9, disconnect: 10,
} as const)
export type UploadCommandName = keyof typeof UploadCommand
export const UploadPhase = ['normal', 'ready', 'receiving', 'verified', 'pending', 'trial', 'recovery', 'publishing'] as const
export type UploadPhaseName = typeof UploadPhase[number]
export const UploadResult = ['ok', 'state', 'unsafe', 'identity', 'limit', 'stale', 'length', 'conflict', 'hash', 'rejected', 'backend', 'needs-recovery', 'progress'] as const
export type UploadResultName = typeof UploadResult[number]
export const ZERO_DIGEST = '0'.repeat(64)

/** Public MWLD v1, request 30: cached hardware meters, never self-test peaks. */
export const LOAD_BYTES = 48
export interface LoadReading {
  ticks: number; frames: number
  cpu: number | null; tracks1to4: number | null; tracks5to8: number | null
  peak1to4: number | null; peak5to8: number | null
}
export function parseLoadReading(view: DataView): LoadReading {
  if (view.byteLength !== LOAD_BYTES || view.getUint32(0) !== 0x4d574c44 || view.getUint8(4) !== 1 ||
    view.getUint8(5) & ~7 || view.getUint16(6) !== LOAD_BYTES) throw new Error('The Octatrack load record is unsupported or incomplete.')
  const ticks = view.getUint32(8), flags = view.getUint8(5)
  const values = Array.from({ length: 5 }, (_, i) => view.getUint32(28 + 4 * i))
  if (values.some(value => value > 1000)) throw new Error('The Octatrack load reading is outside its meter range.')
  // Ticks wrap at uint32. Uninitialized or old meter windows are gaps, never zero load.
  const fresh = (bit: number, offset: number) => !!(flags & bit) && ((ticks - view.getUint32(offset)) >>> 0) <= 600
  const cpu = fresh(1, 16), core0 = fresh(2, 20), core1 = fresh(4, 24)
  return { ticks, frames: view.getUint32(12), cpu: cpu ? values[0] : null,
    tracks5to8: core0 ? values[1] : null, peak5to8: core0 ? values[2] : null,
    tracks1to4: core1 ? values[3] : null, peak1to4: core1 ? values[4] : null }
}

/** Private beta saved-file export. Only the two fixed MODWERK slots, never arbitrary memory or paths. The module pool
 * (build_core.py RUNTIME_POOL_BYTES) and the header, as modset.c's SET_BYTES. */
export const SAVED_SET_CAPACITY = 2097152 + 4096
export const SAVED_SET_METADATA_BYTES = 80
export const SAVED_SET_CHUNK_BYTES = 480
export const SAVED_SET_CHUNK_DATA = 448
export const SavedSetStatus = ['idle', 'pending', 'ready', 'busy', 'unsafe', 'read-failed', 'invalid'] as const
export type SavedSetStatusName = typeof SavedSetStatus[number]
export interface SavedSetMetadata {
  status: SavedSetStatusName; slot: 0 | 1; token: number; length: number; sha256: string; fileBase: string
}
export type SavedSetSnapshot =
  | (SavedSetMetadata & { status: 'ready'; data: Uint8Array })
  | (SavedSetMetadata & { status: 'unsafe' | 'read-failed' | 'invalid' })

export function parseSavedSetMetadata(view: DataView): SavedSetMetadata {
  const fail = (): never => { throw new UploadWireError('The saved module-file snapshot metadata is malformed.') }
  if (view.byteLength !== SAVED_SET_METADATA_BYTES || view.getUint32(0) !== 0x4d575345 || view.getUint8(4) !== 1 || view.getUint8(7)) fail()
  const status = SavedSetStatus[view.getUint8(5)], slot = view.getUint8(6), token = view.getUint32(8), length = view.getUint32(12)
  const sha256 = digestHex(new Uint8Array(view.buffer, view.byteOffset + 16, 32)), fileBase = digestHex(new Uint8Array(view.buffer, view.byteOffset + 48, 32))
  if (!status || slot > 1 || token > 65535 || (!['idle', 'busy'].includes(status) && !token) ||
      (status === 'ready' ? !length || length > SAVED_SET_CAPACITY || sha256 === ZERO_DIGEST : length || sha256 !== ZERO_DIGEST || fileBase !== ZERO_DIGEST)) fail()
  return { status, slot: slot as 0 | 1, token, length, sha256, fileBase }
}

/** Every chunk is bound to one immutable snapshot, including zeroed header and tail padding. */
export function parseSavedSetChunk(view: DataView, snapshot: SavedSetMetadata, index: number): Uint8Array {
  const fail = (): never => { throw new UploadWireError('The saved module-file chunk does not match its immutable snapshot.') }
  const offset = index * SAVED_SET_CHUNK_DATA
  if (snapshot.status !== 'ready' || !Number.isInteger(index) || index < 0 || offset >= snapshot.length ||
      view.byteLength !== SAVED_SET_CHUNK_BYTES || view.getUint32(0) !== 0x4d575343 || view.getUint8(4) !== 1 ||
      view.getUint8(5) !== 2 || view.getUint8(6) !== snapshot.slot || view.getUint8(7) || view.getUint32(8) !== snapshot.token ||
      view.getUint32(12) !== offset || view.getUint32(16) !== snapshot.length || view.getUint32(20) !== Math.min(SAVED_SET_CHUNK_DATA, snapshot.length - offset)) fail()
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength), length = view.getUint32(20)
  if (bytes.subarray(24, 32).some(byte => byte) || bytes.subarray(32 + length).some(byte => byte)) fail()
  return bytes.slice(32, 32 + length)
}

type BoundRequest = { transaction: number; session: string }
export type UploadRequest =
  | { command: 'hello' }
  | { command: 'enter'; session: string }
  | (BoundRequest & { command: 'begin'; base: string; digest: string; generation: number; length: number })
  | (BoundRequest & { command: 'chunk'; offset: number; data: Uint8Array })
  | (BoundRequest & { command: Exclude<UploadCommandName, 'hello' | 'enter' | 'begin' | 'chunk'> })

export interface UploadStatus {
  readonly command: UploadCommandName
  readonly transaction: number
  readonly result: UploadResultName
  readonly phase: UploadPhaseName
  readonly activeKnown: boolean
  readonly generation: number
  readonly lastTransaction: number
  readonly currentTransaction: number
  readonly received: number
  readonly capacity: number
  readonly base: string
  readonly session: string
  readonly active: string | null
}

export class UploadWireError extends Error {
  constructor(message: string) { super(message); this.name = 'UploadWireError' }
}

export function digestBytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new UploadWireError('Expected a pinned 32-byte lowercase SHA-256 identity.')
  return Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}
function digestHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
function u32(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new UploadWireError('Value is outside the unsigned 32-bit wire range.')
  return value
}

export function encodeUploadRequest(request: UploadRequest): Uint8Array {
  let body = new Uint8Array(0)
  if (request.command === 'begin') {
    if (!request.transaction || !request.length || request.length > UPLOAD_MAX_BYTES) throw new UploadWireError('A module offer needs a nonzero transaction and bounded payload.')
    body = new Uint8Array(72)
    body.set(digestBytes(request.base)); body.set(digestBytes(request.digest), 32)
    const view = new DataView(body.buffer)
    view.setUint32(64, u32(request.generation)); view.setUint32(68, u32(request.length))
  } else if (request.command === 'chunk') {
    if (!request.transaction || !request.data.length || request.data.length > UPLOAD_MAX_CHUNK || u32(request.offset) > UPLOAD_MAX_BYTES - request.data.length)
      throw new UploadWireError('Chunk exceeds the bounded module-set protocol.')
    body = new Uint8Array(4 + request.data.length)
    new DataView(body.buffer).setUint32(0, request.offset); body.set(request.data, 4)
  }
  const command = UploadCommand[request.command]
  if (!Object.hasOwn(UploadCommand, request.command)) throw new UploadWireError('Unknown upload command.')
  const frame = new Uint8Array(UPLOAD_HEADER + body.length), view = new DataView(frame.buffer)
  frame.set([0x4d, 0x57, 0x55, 0x50]); view.setUint16(4, UPLOAD_VERSION); view.setUint16(6, command)
  view.setUint32(8, 'transaction' in request ? u32(request.transaction) : 0)
  view.setUint32(12, body.length)
  if ('session' in request) {
    if (request.session === ZERO_DIGEST) throw new UploadWireError('A mutation requires a nonzero device session.')
    frame.set(digestBytes(request.session), 16)
  }
  frame.set(body, UPLOAD_HEADER)
  return frame
}

/** Match the acknowledgement to its request before exposing any state. */
export function decodeUploadResponse(bytes: Uint8Array, request: UploadRequest, binding?: { base: string; session?: string }): UploadStatus {
  if (bytes.length !== UPLOAD_RESPONSE) throw new UploadWireError('Upload acknowledgement has an incorrect length.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x4d575552 || view.getUint16(4) !== UPLOAD_VERSION || view.getUint32(12) !== UPLOAD_RESPONSE - 16)
    throw new UploadWireError('Upload acknowledgement has an unsupported header.')
  const transaction = 'transaction' in request ? request.transaction : 0
  if (view.getUint16(6) !== UploadCommand[request.command] || view.getUint32(8) !== transaction)
    throw new UploadWireError('Upload acknowledgement belongs to a different command or transaction.')
  const result = UploadResult[view.getUint32(16)], phase = UploadPhase[view.getUint32(20)], known = view.getUint32(24)
  const generation = view.getUint32(28), lastTransaction = view.getUint32(32), currentTransaction = view.getUint32(36)
  const received = view.getUint32(40), capacity = view.getUint32(44)
  if (!result || !phase || known > 1 || !capacity || capacity > UPLOAD_MAX_BYTES || received > capacity || currentTransaction > lastTransaction)
    throw new UploadWireError('Upload acknowledgement contains invalid status fields.')
  const base = digestHex(bytes.subarray(48, 80)), session = digestHex(bytes.subarray(80, 112)), active = digestHex(bytes.subarray(112))
  if (session === ZERO_DIGEST || ('session' in request && session !== request.session) ||
      (request.command === 'begin' && base !== request.base) ||
      (binding && (base !== binding.base || binding.session && session !== binding.session)))
    throw new UploadWireError('The device base or session identity changed.')
  if ((!known && (!['recovery', 'publishing'].includes(phase) || active !== ZERO_DIGEST)) ||
      (result === 'progress' && (request.command !== 'commit' || phase !== 'publishing')) ||
      (phase === 'publishing' && (known || !currentTransaction || !received)) ||
      (['receiving', 'verified', 'pending', 'trial'].includes(phase) && (!currentTransaction || !known)) ||
      (['verified', 'pending', 'trial'].includes(phase) && !received))
    throw new UploadWireError('Upload acknowledgement describes an impossible controller state.')
  return Object.freeze({ command: request.command, transaction, result, phase, activeKnown: known === 1,
    generation, lastTransaction, currentTransaction, received, capacity, base, session, active: known ? active : null })
}
