// SPDX-License-Identifier: GPL-3.0-or-later
// Browser-native peer of sdk/runtime/upload/wire.c. No device access here.
export const UPLOAD_VERSION = 1
export const UPLOAD_HEADER = 48
export const UPLOAD_RESPONSE = 144
export const UPLOAD_MAX_CHUNK = 4096
export const UPLOAD_MAX_BYTES = 2097152 // sdk/runtime/upload/upload.h MU_MAX_BYTES: a whole OS image fits
export const UPLOAD_MAX_FRAME = UPLOAD_HEADER + 4 + UPLOAD_MAX_CHUNK
export const UploadCommand = Object.freeze({
  hello: 0, enter: 1, begin: 2, chunk: 3, verify: 4, commit: 5,
  accept: 6, rollback: 7, abort: 8, leave: 9, disconnect: 10,
} as const)
export type UploadCommandName = keyof typeof UploadCommand
export const UploadPhase = ['normal', 'ready', 'receiving', 'verified', 'pending', 'trial', 'recovery'] as const
export type UploadPhaseName = typeof UploadPhase[number]
export const UploadResult = ['ok', 'state', 'unsafe', 'identity', 'limit', 'stale', 'length', 'conflict', 'hash', 'rejected', 'backend', 'needs-recovery'] as const
export type UploadResultName = typeof UploadResult[number]
export const ZERO_DIGEST = '0'.repeat(64)

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
  if ((!known && (phase !== 'recovery' || active !== ZERO_DIGEST)) ||
      (['receiving', 'verified', 'pending', 'trial'].includes(phase) && (!currentTransaction || !known)) ||
      (['verified', 'pending', 'trial'].includes(phase) && !received))
    throw new UploadWireError('Upload acknowledgement describes an impossible controller state.')
  return Object.freeze({ command: request.command, transaction, result, phase, activeKnown: known === 1,
    generation, lastTransaction, currentTransaction, received, capacity, base, session, active: known ? active : null })
}
