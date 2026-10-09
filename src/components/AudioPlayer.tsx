import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import { Icon } from './Icon'
import './audio-player.css'

type Props = { src: string; label: string; variant?: 'default' | 'compact' | 'card' }
// All site players share the same playback owner, including previews in dialogs.
let playing: HTMLAudioElement | null = null
function time(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0')
}

export function AudioPlayer(props: Props) {
  // Changing a clip releases its old decoder, requests and playback state.
  return <Player key={props.src} {...props}/>
}

function Player({ src, label, variant = 'default' }: Props) {
  const container = useRef<HTMLDivElement>(null), waveform = useRef<HTMLDivElement>(null), audio = useRef<HTMLAudioElement>(null)
  const wave = useRef<WaveSurfer | null>(null), initialize = useRef<() => void>(() => {})
  const [waveStatus, setWaveStatus] = useState<'waiting' | 'loading' | 'ready' | 'unavailable'>('waiting')
  const [state, setState] = useState({ playing: false, currentTime: 0, duration: 0 }), [error, setError] = useState('')
  const [hover, setHover] = useState<{ position: number; time: number } | null>(null)
  useEffect(() => {
    const element = audio.current!, host = waveform.current!, player = container.current!
    let cancelled = false, started = false
    // Restore the source after React Strict Mode's setup/cleanup cycle.
    element.src = src
    async function start() {
      if (cancelled || started) return
      started = true; setWaveStatus('loading')
      element.preload = 'metadata'
      if (!element.readyState && element.paused) element.load()
      try {
        const { default: WaveSurfer } = await import('wavesurfer.js')
        if (cancelled) return
        const colors = getComputedStyle(player)
        const instance = WaveSurfer.create({
          container: host, media: element, height: variant === 'compact' ? 32 : variant === 'card' ? 56 : 40,
          waveColor: colors.getPropertyValue('--audio-wave').trim() || '#a0a0ac',
          progressColor: colors.getPropertyValue('--audio-accent').trim() || '#929bff',
          cursorWidth: 1, cursorColor: colors.getPropertyValue('--audio-accent').trim() || '#929bff',
          barWidth: variant === 'card' ? 3 : 2, barGap: 2, barRadius: 2, barMinHeight: 2,
          // The native range supplies pointer, touch and keyboard seeking.
          interact: false, hideScrollbar: true, sampleRate: 8000, normalize: true,
        })
        wave.current = instance
        instance.on('ready', duration => {
          if (cancelled) return
          setWaveStatus('ready')
          setState(current => ({ ...current, duration }))
        })
        instance.on('error', () => { if (!cancelled) setWaveStatus('unavailable') })
      } catch { if (!cancelled) setWaveStatus('unavailable') }
    }
    initialize.current = () => { void start() }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void start() }
    })
    if (observer) observer.observe(player)
    else void start()
    return () => {
      cancelled = true; observer?.disconnect(); initialize.current = () => {}
      wave.current?.destroy(); wave.current = null
      if (playing === element) playing = null
      element.pause(); element.removeAttribute('src'); element.load()
    }
  }, [src, variant])

  function update() {
    const element = audio.current
    if (!element) return
    setState(current => ({ playing: !element.paused && !element.ended, currentTime: element.currentTime,
      duration: Number.isFinite(element.duration) && element.duration > 0 ? element.duration : current.duration }))
  }
  function toggle() {
    const element = audio.current!
    if (!element.paused) { element.pause(); return }
    initialize.current(); setError('')
    if (element.error) element.load()
    if (element.ended) element.currentTime = 0
    // Call play during the gesture, even while the waveform bundle is loading.
    void element.play().catch(() => {
      if (audio.current === element) setError('This clip could not be played. Try again.')
    })
  }
  function seek(value: number) {
    const currentTime = Math.max(0, Math.min(state.duration, value))
    if (wave.current) wave.current.setTime(currentTime)
    else audio.current!.currentTime = currentTime
    setState(current => ({ ...current, currentTime }))
  }
  function seekKey(event: KeyboardEvent<HTMLInputElement>) {
    const delta = event.shiftKey ? 10 : 5
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? state.duration
      : ['ArrowRight', 'ArrowUp'].includes(event.key) ? state.currentTime + delta
      : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? state.currentTime - delta : null
    if (target !== null) { event.preventDefault(); seek(target) }
  }
  function hoverSeek(event: PointerEvent<HTMLInputElement>) {
    if (event.pointerType === 'touch' || !state.duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    setHover({ position, time: position * state.duration })
  }
  return <div ref={container} className="audio-player" data-variant={variant} data-wave-status={waveStatus} data-playing={state.playing || undefined} role="group" aria-label={label}>
    <div className="audio-player-wave">
      <div ref={waveform} className="audio-player-render" aria-hidden="true"/>
      {waveStatus !== 'ready' && <div className="audio-player-placeholder" aria-hidden="true">
        <span className="audio-player-fallback-progress" style={{ width: (state.duration ? state.currentTime / state.duration * 100 : 0) + '%' }}/>
        <span>{waveStatus === 'loading' ? 'Loading waveform…' : waveStatus === 'unavailable' ? 'Waveform unavailable' : 'Sound clip'}</span>
      </div>}
      <input className="audio-player-seek" type="range" min={0} max={state.duration || 1} step="0.1" value={Math.min(state.currentTime, state.duration)} disabled={!state.duration}
        aria-label={'Seek in ' + label} aria-valuetext={time(state.currentTime) + ' of ' + time(state.duration)} onChange={event => seek(Number(event.target.value))} onKeyDown={seekKey}
        onPointerMove={hoverSeek} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}/>
      {hover && <span className="audio-player-hover" style={{ left: hover.position * 100 + '%' }} aria-hidden="true"><span>{time(hover.time)}</span></span>}
    </div>
    <button type="button" className="audio-player-play" aria-label={(state.playing ? 'Pause ' : 'Play ') + label} aria-pressed={state.playing} onClick={toggle}><Icon name={state.playing ? 'pause' : 'play'} size={18}/></button>
    <span className="audio-player-time" aria-hidden="true"><span className="audio-player-elapsed">{time(state.currentTime)}</span><span className="audio-player-divider">/</span><span className="audio-player-duration">{state.duration ? time(state.duration) : '—:—'}</span></span>
    {error && <span className="audio-player-error" role="alert">{error}</span>}
    <audio ref={audio} src={src} preload="none" hidden
      onPlay={event => { if (playing && playing !== event.currentTarget) playing.pause(); playing = event.currentTarget; setError(''); update() }}
      onPause={event => { if (playing === event.currentTarget) playing = null; update() }} onEnded={event => { if (playing === event.currentTarget) playing = null; update() }}
      onTimeUpdate={update} onLoadedMetadata={update} onDurationChange={update}
      onError={() => setError('This clip could not be loaded. Try again.')}/>
  </div>
}
