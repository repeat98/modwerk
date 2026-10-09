import { describe, expect, it } from 'vitest'
import {
  decodeUploadResponse, encodeUploadRequest, UPLOAD_MAX_BYTES, UPLOAD_MAX_CHUNK,
  ZERO_DIGEST, type UploadRequest,
} from './upload-wire'

const base = '31'.repeat(32), session = '52'.repeat(32), active = '41'.repeat(32)
// Independently specified wire status: BE version/command/length, eight BE
// words, then base/session/active identities. No firmware-derived bytes.
function helloReply() {
  return Uint8Array.from(Buffer.from('4d575552000100000000000000000080' +
    '0000000000000000000000010000000700000009000000090000000000002000' + base + session + active, 'hex'))
}

it('encodes a HELLO with only a zero discovery session', () => {
  expect(Buffer.from(encodeUploadRequest({ command: 'hello' })).toString('hex')).toBe(
    '4d575550000100000000000000000000' + ZERO_DIGEST)
})

it('encodes a pinned bounded BEGIN in the C decoder byte order', () => {
  const frame = encodeUploadRequest({ command: 'begin', transaction: 0x01020304, session, base, digest: active, generation: 7, length: 0x1234 })
  expect(Buffer.from(frame).toString('hex')).toBe(
    '4d575550000100020102030400000048' + session + base + active + '0000000700001234')
})

it('copies chunk bytes and supports the protocol boundary', () => {
  const data = new Uint8Array(UPLOAD_MAX_CHUNK).fill(0x87)
  const frame = encodeUploadRequest({ command: 'chunk', transaction: 1, session, offset: UPLOAD_MAX_BYTES - data.length, data })
  data.fill(0)
  expect(frame.length).toBe(48 + 4 + UPLOAD_MAX_CHUNK)
  expect(new DataView(frame.buffer).getUint32(48)).toBe(UPLOAD_MAX_BYTES - UPLOAD_MAX_CHUNK)
  expect(frame.subarray(52).every(byte => byte === 0x87)).toBe(true)
})

it('decodes byte-offset views without exposing mutable identity bytes', () => {
  const reply = helloReply(), envelope = new Uint8Array(reply.length + 10)
  envelope.set(reply, 5)
  const status = decodeUploadResponse(envelope.subarray(5, -5), { command: 'hello' }, { base })
  expect(status).toMatchObject({ result: 'ok', phase: 'normal', base, session, active, generation: 7, lastTransaction: 9, currentTransaction: 9, capacity: 8192 })
  reply.fill(0); envelope.fill(0)
  expect(status.active).toBe(active)
  expect(Object.isFrozen(status)).toBe(true)
})

describe('refuses malformed or unrelated acknowledgements', () => {
  it.each([
    ['magic', 0, 0], ['version', 4, 2], ['command', 6, 1], ['transaction', 8, 1], ['body length', 12, 127],
    ['result', 16, 12], ['phase', 20, 7], ['known flag', 24, 2], ['zero capacity', 44, 0],
    ['capacity overflow', 44, UPLOAD_MAX_BYTES + 1], ['received overflow', 40, 8193], ['transaction ownership', 36, 10],
  ])('%s', (_, offset, value) => {
    const reply = helloReply(), view = new DataView(reply.buffer)
    if (offset === 4 || offset === 6) view.setUint16(offset, value)
    else view.setUint32(offset, value)
    expect(() => decodeUploadResponse(reply, { command: 'hello' }, { base })).toThrow()
  })
  it('refuses short and trailing responses', () => {
    for (const reply of [helloReply().subarray(0, 143), new Uint8Array(145)])
      expect(() => decodeUploadResponse(reply, { command: 'hello' })).toThrow()
  })
  it('refuses changed/empty sessions, a wrong base and unknown activity outside recovery', () => {
    expect(() => decodeUploadResponse(helloReply(), { command: 'hello' }, { base: active })).toThrow()
    const request: UploadRequest = { command: 'enter', session: active }
    const response = helloReply(); new DataView(response.buffer).setUint16(6, 1)
    expect(() => decodeUploadResponse(response, request)).toThrow()
    const zero = helloReply(); zero.fill(0, 80, 112)
    expect(() => decodeUploadResponse(zero, { command: 'hello' })).toThrow()
    const unknown = helloReply(); new DataView(unknown.buffer).setUint32(24, 0); unknown.fill(0, 112)
    expect(() => decodeUploadResponse(unknown, { command: 'hello' })).toThrow()
    new DataView(unknown.buffer).setUint32(20, 6)
    expect(decodeUploadResponse(unknown, { command: 'hello' }).active).toBeNull()
  })
})

it('rejects malformed local identities, integers and oversized or empty transfers before encoding', () => {
  const offer: UploadRequest = { command: 'begin', transaction: 1, session, base, digest: active, generation: 0, length: 1 }
  for (const request of [
    { ...offer, transaction: -1 }, { ...offer, transaction: 0 }, { ...offer, generation: 0.5 },
    { ...offer, length: UPLOAD_MAX_BYTES + 1 }, { ...offer, length: 0 }, { ...offer, session: ZERO_DIGEST }, { ...offer, digest: 'bad' },
    { command: 'chunk', transaction: 1, session, offset: -1, data: new Uint8Array(1) },
    { command: 'chunk', transaction: 1, session, offset: 0, data: new Uint8Array(0) },
    { command: 'chunk', transaction: 1, session, offset: 0, data: new Uint8Array(UPLOAD_MAX_CHUNK + 1) },
    { command: 'toString' },
  ]) expect(() => encodeUploadRequest(request as UploadRequest)).toThrow()
})
