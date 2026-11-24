// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UsbVendorTransport, type ControlDevice } from '../engine/elekloader/upload-usb'
import { adoptSession, leaveSession, paintLcd, ScreenSession } from './octatrack-screen-session'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('reads only the fixed MWLC packet from the claimed interface and rejects malformed frames', async () => {
  const bytes = new Uint8Array(1040)
  const data = new DataView(bytes.buffer, 7, 1028)
  data.setUint32(0, 0x4d574c43)
  data.setUint8(4, 123)
  const read = vi.fn<ControlDevice['controlTransferIn']>().mockResolvedValue({ status: 'ok', data })
  const transport = new UsbVendorTransport({ controlTransferIn: read, controlTransferOut: vi.fn() }, 5)
  const frame = await transport.screen()
  expect(read).toHaveBeenCalledWith({ requestType: 'vendor', recipient: 'interface', request: 7, value: 0, index: 5 }, 1028)
  expect(frame).toHaveLength(1024)
  expect(frame[0]).toBe(123)
  data.setUint32(0, 0)
  await expect(transport.screen()).rejects.toThrow('complete screen')
  read.mockResolvedValue({ status: 'ok', data: new DataView(bytes.buffer, 7, 1027) })
  await expect(transport.screen()).rejects.toThrow('complete screen')
})

it('maps the top, bottom and adjacent columns of the LCD independently', () => {
  const frame = new Uint8Array(1024)
  frame[7] = 1; frame[8] = 0x80; frame[127 * 8 + 3] = 1
  const image = { data: new Uint8ClampedArray(128 * 64 * 4) } as ImageData
  paintLcd(frame, image)
  const lit = [...image.data].filter((v, i) => i % 4 === 0 && v === 255)
  expect(lit).toHaveLength(3)
  for (const [x, y] of [[0, 0], [1, 63], [127, 32]]) expect(image.data[4 * (128 * y + x)]).toBe(255)
})

it('shares slow reads with the popup and recorder, and releases both when preview stops', async () => {
  vi.useFakeTimers()
  let resolve!: (frame: Uint8Array) => void
  const read = vi.fn(() => new Promise<Uint8Array>(done => { resolve = done }))
  const draw = vi.fn(), putImageData = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
    return { canvas: this, drawImage: draw, putImageData, createImageData: () => ({ data: new Uint8ClampedArray(32768) }) } as unknown as CanvasRenderingContext2D
  })
  const canvas = document.createElement('canvas'), endTrack = vi.fn()
  const captureStream = vi.fn(() => ({ getTracks: () => [{ stop: endTrack }] }))
  Object.assign(canvas, { captureStream })
  const popup = { document: document.implementation.createHTMLDocument(), closed: false, close: vi.fn(),
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), addEventListener: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  const started = vi.fn()
  class FakeRecorder {
    static isTypeSupported() { return true }
    state = 'inactive'
    ondataavailable!: (event: { data: Blob }) => void
    onstop!: () => void
    start() { started(); this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['video'], { type: 'video/webm' }) }); this.onstop() }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  const events = { ready: vi.fn(), detached: vi.fn(), recording: vi.fn(), saved: vi.fn(), failed: vi.fn() }
  const session = new ScreenSession({ screen: read } as unknown as OctatrackLink, canvas, events, 5)
  expect(read).not.toHaveBeenCalled()
  const first = session.next()
  await vi.advanceTimersByTimeAsync(2000)
  expect(read).toHaveBeenCalledTimes(1)
  resolve(new Uint8Array(1024)); await first
  session.setFrameRate(30)
  session.popOut(); session.record()
  expect(captureStream).toHaveBeenCalledWith(30)
  expect(started).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(199)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(2001)
  expect(read).toHaveBeenCalledTimes(2)
  const beforeRepeat = draw.mock.calls.length
  session.setFrameRate(5) // A recording keeps the rate it started with.
  resolve(new Uint8Array(1024))
  await vi.advanceTimersByTimeAsync(32)
  expect(read).toHaveBeenCalledTimes(2)
  expect(putImageData).toHaveBeenCalledTimes(1)
  expect(draw).toHaveBeenCalledTimes(beforeRepeat + 1) // The recorder gets the static frame, the popup skips it.
  await vi.advanceTimersByTimeAsync(2)
  expect(read).toHaveBeenCalledTimes(3)
  session.stopRecording()
  const paints = draw.mock.calls.length
  resolve(new Uint8Array(1024))
  await vi.advanceTimersByTimeAsync(34)
  expect(draw).toHaveBeenCalledTimes(paints)
  expect(read).toHaveBeenCalledTimes(4)
  session.close()
  resolve(new Uint8Array(1024))
  await vi.advanceTimersByTimeAsync(2000)
  expect(read).toHaveBeenCalledTimes(4)
  expect(draw).toHaveBeenCalledTimes(paints)
  expect(endTrack).toHaveBeenCalledOnce()
  expect(events.saved).toHaveBeenCalledOnce()
  expect(events.failed).not.toHaveBeenCalled()
  expect(popup.close).toHaveBeenCalledOnce()
})

it('keeps a popped-out session reading and recording after the page leaves, until its popup closes', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => new Uint8Array(1024))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
    return { canvas: this, drawImage: vi.fn(), putImageData: vi.fn(), createImageData: () => ({ data: new Uint8ClampedArray(32768) }) } as unknown as CanvasRenderingContext2D
  })
  let hide!: () => void
  const popup = { document: document.implementation.createHTMLDocument(), closed: false, close: vi.fn(),
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    addEventListener: (_: string, listener: () => void) => { hide = listener } }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true }
    state = 'inactive'
    ondataavailable!: (event: { data: Blob }) => void
    onstop!: () => void
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['video']) }); this.onstop() }
  })
  const page = { ready: vi.fn(), detached: vi.fn(), recording: vi.fn(), saved: vi.fn(), failed: vi.fn() }
  const link = { screen: read } as unknown as OctatrackLink
  const lone = new ScreenSession(link, document.createElement('canvas'), page, 10)
  await lone.next()
  leaveSession(lone, vi.fn()) // Without a popup the session ends with the page.
  expect(adoptSession()).toBeUndefined()
  const canvas = Object.assign(document.createElement('canvas'), { captureStream: () => ({ getTracks: () => [] }) })
  const session = new ScreenSession(link, canvas, page, 10)
  await session.next()
  session.popOut(); session.record()
  const save = vi.fn()
  leaveSession(session, save)
  expect(canvas.isConnected).toBe(true)
  let reads = read.mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(read.mock.calls.length).toBeGreaterThan(reads + 3)
  expect(adoptSession()).toBe(session) // The page came back
  expect(session.recording).toBe(true)
  leaveSession(session, save) // and left again.
  popup.closed = true; hide()
  expect(save).toHaveBeenCalledOnce()
  expect(adoptSession()).toBeUndefined()
  expect(canvas.isConnected).toBe(false)
  reads = read.mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(read).toHaveBeenCalledTimes(reads)
  expect(page.saved).not.toHaveBeenCalled()
  expect(page.failed).not.toHaveBeenCalled()
})
