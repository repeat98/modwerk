// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WaveSurferOptions } from 'wavesurfer.js'
import { AudioPlayer } from './AudioPlayer'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('wavesurfer.js', () => ({ default: { create: mocks.create } }))
type Callbacks = { ready?: (duration: number) => void; error?: (error: Error) => void }
let root: Root, container: HTMLDivElement
let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[]
let instances: { options: WaveSurferOptions; callbacks: Callbacks; destroy: ReturnType<typeof vi.fn>; setTime: ReturnType<typeof vi.fn> }[]

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  observers = []; instances = []
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn()
    observe = vi.fn()
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }) }
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false })
    this.dispatchEvent(new Event('play')); return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true })
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  mocks.create.mockImplementation((options: WaveSurferOptions) => {
    const callbacks: Callbacks = {}
    const instance = { options, callbacks, destroy: vi.fn(), setTime: vi.fn((time: number) => { options.media!.currentTime = time }) }
    instances.push(instance)
    return { ...instance, on: (event: keyof Callbacks, callback: Callbacks[keyof Callbacks]) => { Object.assign(callbacks, { [event]: callback }) } }
  })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount()); container.remove(); mocks.create.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function visible(index = 0) {
  await act(async () => observers[index].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
}
async function click(index = 0) { await act(async () => container.querySelectorAll<HTMLButtonElement>('button')[index].click()) }
async function metadata(duration = 60, index = 0) {
  const media = container.querySelectorAll('audio')[index]
  Object.defineProperty(media, 'duration', { configurable: true, value: duration })
  await act(() => media.dispatchEvent(new Event('loadedmetadata')))
}
function render(src = '/clip.wav') { return createElement(AudioPlayer, { src, label: 'test clip' }) }

describe('site audio playback', () => {
  it('defers waveform requests for hidden players and uses the existing media source when visible', async () => {
    await act(() => root.render(render('blob:private-preview')))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(container.querySelector('audio')!.preload).toBe('none')
    await visible()
    expect(instances).toHaveLength(1)
    expect(instances[0].options.media).toBe(container.querySelector('audio'))
    expect(instances[0].options.media!.src).toBe('blob:private-preview')
    expect(observers[0].disconnect).toHaveBeenCalled()
    await act(() => instances[0].callbacks.ready!(60))
    expect(container.querySelector('.audio-player')!.getAttribute('data-wave-status')).toBe('ready')
  })

  it('starts from a play gesture before intersection and pauses a clip on another surface', async () => {
    await act(() => root.render(createElement('div', null, render(), createElement(AudioPlayer, { src: '/other.wav', label: 'other clip', variant: 'card' }))))
    await click()
    const [first, second] = container.querySelectorAll('audio')
    expect(first.paused).toBe(false)
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Pause test clip')
    await click(1)
    expect(first.paused).toBe(true); expect(second.paused).toBe(false)
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Play test clip')
  })

  it('keeps playback and keyboard seeking available when waveform decoding fails', async () => {
    await act(() => root.render(render()))
    await visible(); await metadata()
    await act(() => instances[0].callbacks.error!(new Error('decode failed')))
    await click()
    const slider = container.querySelector('input')!
    expect(slider.disabled).toBe(false)
    await act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(container.querySelector('audio')!.currentTime).toBe(5)
    await act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })))
    expect(slider.getAttribute('aria-valuetext')).toBe('0:15 of 1:00')
    await act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(container.querySelector('audio')!.currentTime).toBe(60)
    await act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
    expect(container.querySelector('audio')!.currentTime).toBe(0)
  })

  it('reports failed playback and allows another attempt', async () => {
    await act(() => root.render(render()))
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('network failure'))
    await click()
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('could not be played')
    await click()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('retains the decoded duration when a streamed clip reports an unknown native duration', async () => {
    await act(() => root.render(render()))
    await visible(); await metadata(Infinity)
    await act(() => instances[0].callbacks.ready!(60))
    await click()
    const media = container.querySelector('audio')!
    media.currentTime = 12
    await act(() => media.dispatchEvent(new Event('timeupdate')))
    expect(container.querySelector('input')!.max).toBe('60')
    expect(container.querySelector('input')!.getAttribute('aria-valuetext')).toBe('0:12 of 1:00')
  })

  it('releases old playback and ignores late decoder results when a source changes', async () => {
    await act(() => root.render(render()))
    await visible(); await metadata(); await click()
    const oldMedia = container.querySelector('audio')!, old = instances[0]
    await act(() => root.render(render('/replacement.wav')))
    expect(old.destroy).toHaveBeenCalledOnce(); expect(oldMedia.paused).toBe(true)
    expect(oldMedia.hasAttribute('src')).toBe(false)
    await act(() => old.callbacks.ready!(999))
    expect(container.querySelector('input')!.disabled).toBe(true)
    expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe('false')
    await visible(1)
    expect(instances[1].options.media!.src).toContain('/replacement.wav')
  })

  it('survives Strict Mode cleanup and disconnects the discarded observer', async () => {
    await act(async () => root.render(createElement(StrictMode, null, render())))
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    await visible(1)
    expect(instances).toHaveLength(1)
    expect(instances[0].options.media!.src).toContain('/clip.wav')
    await act(() => root.unmount())
    expect(instances[0].destroy).toHaveBeenCalledOnce()
    // Supply a fresh root for afterEach.
    root = createRoot(container)
  })
})
