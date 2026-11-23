// SPDX-License-Identifier: GPL-3.0-or-later
// The browser owns the only USB reader. Recording and a detached canvas consume its frames.
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'

const WIDTH = 128, HEIGHT = 64
export const SCREEN_FRAME_RATES = [5, 10, 15, 30] as const
export type ScreenFrameRate = typeof SCREEN_FRAME_RATES[number]
export const DEFAULT_SCREEN_FPS: ScreenFrameRate = 15
export const VIDEO_WIDTH = WIDTH * 6, VIDEO_HEIGHT = HEIGHT * 6

export function paintLcd(frame: Uint8Array, image: ImageData) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const lit = frame[x * 8 + 7 - (y >> 3)] & (1 << (y & 7))
      const at = 4 * (y * WIDTH + x), value = lit ? 255 : 24
      image.data[at] = image.data[at + 1] = image.data[at + 2] = value
      image.data[at + 3] = 255
    }
  }
}

export type Events = {
  ready: () => void
  detached: (open: boolean) => void
  recording: (on: boolean) => void
  saved: (blob: Blob) => void
  failed: (message: string) => void
}

export class ScreenSession {
  private readonly abort = new AbortController()
  private timer?: () => void
  private popup?: Window
  private mirror?: CanvasRenderingContext2D
  private recorder?: MediaRecorder
  private lastFrame?: Uint8Array
  fps: ScreenFrameRate
  private readonly pixels: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly output: CanvasRenderingContext2D
  private readonly link: OctatrackLink
  /** Swapped when the page leaves (leaveSession) and when it comes back (adoptSession). */
  events: Events
  constructor(link: OctatrackLink, canvas: HTMLCanvasElement, events: Events, fps: ScreenFrameRate = DEFAULT_SCREEN_FPS) {
    this.fps = fps
    this.link = link
    this.events = events
    const pixels = document.createElement('canvas')
    pixels.width = WIDTH
    pixels.height = HEIGHT
    const source = pixels.getContext('2d'), output = canvas.getContext('2d')
    if (!source || !output) throw new Error('This browser could not open the screen preview.')
    this.pixels = source
    this.image = source.createImageData(WIDTH, HEIGHT)
    this.output = output
    output.imageSmoothingEnabled = false
  }
  get canvas() { return this.output.canvas }
  get detached() { return !!this.popup && !this.popup.closed }
  get recording() { return !!this.recorder }
  get hasAudience() { return this.recording || this.detached }

  setFrameRate(fps: ScreenFrameRate) {
    if (!this.recorder) this.fps = fps
  }

  async next() {
    this.timer = undefined
    const { signal } = this.abort
    if (signal.aborted) return
    try {
      const frame = await this.link.screen(signal)
      if (signal.aborted) return
      if (!frame) throw new Error('No screen frame received.')
      const previous = this.lastFrame
      const changed = !previous || frame.some((byte, i) => byte !== previous[i])
      if (changed) {
        paintLcd(frame, this.image)
        this.pixels.putImageData(this.image, 0, 0)
        this.lastFrame = frame
      }
      const canvas = this.output.canvas
      // An unchanged page costs no repaint during preview. The recorder still gets timed frames during pauses.
      if (changed || this.recorder) this.output.drawImage(this.pixels.canvas, 0, 0, canvas.width, canvas.height)
      if (changed && this.popup && !this.popup.closed) this.mirror?.drawImage(canvas, 0, 0)
      if (!previous) this.events.ready()
      // Wait after the transfer settles. A slow transfer cannot build a queue of reads.
      const clock = this.popup && !this.popup.closed ? this.popup : window
      const id = clock.setTimeout(() => void this.next(), Math.ceil(1000 / this.fps))
      this.timer = () => clock.clearTimeout(id)
    } catch {
      if (!signal.aborted) this.events.failed('Preview stopped. Check the USB connection and start preview again.')
    }
  }

  popOut() {
    if (this.popup && !this.popup.closed) { this.popup.focus(); return }
    const popup = window.open('', '_blank', 'popup,width=768,height=384')
    if (!popup) throw new Error('Allow pop-ups for Modwerk to detach the screen.')
    const doc = popup.document
    doc.title = 'Octatrack Screen · Modwerk'
    doc.body.style.cssText = 'margin:0;background:#181818;display:grid;place-items:center;height:100vh'
    const mirror = doc.createElement('canvas')
    mirror.width = VIDEO_WIDTH
    mirror.height = VIDEO_HEIGHT
    mirror.setAttribute('aria-label', 'Live Octatrack screen')
    mirror.style.cssText = 'width:min(100vw,200vh);height:auto;image-rendering:pixelated'
    const ctx = mirror.getContext('2d')
    if (!ctx) { popup.close(); throw new Error('The detached screen could not be opened.') }
    doc.body.append(mirror)
    ctx.drawImage(this.output.canvas, 0, 0)
    this.popup = popup
    this.mirror = ctx
    popup.addEventListener('pagehide', () => {
      if (this.popup !== popup) return
      this.popup = undefined
      this.mirror = undefined
      // A timer in a closing window would never fire. Move it back to the Hub.
      if (this.timer) {
        this.timer()
        const id = window.setTimeout(() => void this.next(), Math.ceil(1000 / this.fps))
        this.timer = () => window.clearTimeout(id)
      }
      this.events.detached(false)
    }, { once: true })
    this.events.detached(true)
  }

  record() {
    if (this.recorder || !this.lastFrame) return
    const stream = this.output.canvas.captureStream(this.fps)
    const release = () => stream.getTracks().forEach(track => track.stop())
    try {
      const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data) }
      recorder.onstop = () => {
        release()
        this.recorder = undefined
        this.events.recording(false)
        if (chunks.length) this.events.saved(new Blob(chunks, { type: recorder.mimeType || chunks[0].type }))
        else this.events.failed('The browser returned an empty recording.')
      }
      recorder.onerror = () => this.events.failed('The browser interrupted the recording.')
      recorder.start(1000)
      this.recorder = recorder
      this.events.recording(true)
    } catch (error) { release(); throw error }
  }
  stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
  }
  close() {
    this.abort.abort()
    this.timer?.()
    this.timer = undefined
    this.stopRecording()
    const popup = this.popup
    this.popup = undefined
    this.mirror = undefined
    popup?.close()
  }
}

// Leaving the Hub unmounts the screen page. A popped-out session keeps reading and recording until its popup closes.
let kept: ScreenSession | undefined
export function leaveSession(session: ScreenSession, save: (blob: Blob) => void) {
  if (!session.detached) return session.close()
  const end = () => { if (kept === session) kept = undefined; session.canvas.remove(); session.close() }
  session.events = { ready() {}, recording() {}, saved: save, failed: end, detached: open => { if (!open) end() } }
  // Parked like a hidden Hub panel, where the recorder is known to keep getting frames.
  session.canvas.hidden = true
  document.body.append(session.canvas)
  kept = session
}
export const keptSession = () => kept
export function adoptSession() { const session = kept; kept = undefined; return session }
