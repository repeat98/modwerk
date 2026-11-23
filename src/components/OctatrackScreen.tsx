import { useCallback, useEffect, useRef, useState } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { DEFAULT_SCREEN_FPS, SCREEN_FRAME_RATES, ScreenSession, type ScreenFrameRate, VIDEO_HEIGHT, VIDEO_WIDTH } from './octatrack-screen-session'
import { Icon } from './Icon'

export function OctatrackScreen({ active, link, supported }: { active: boolean; link: OctatrackLink | null; supported: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const session = useRef<ScreenSession | null>(null)
  const mounted = useRef(false)
  const savedUrl = useRef('')
  const [fps, setFps] = useState<ScreenFrameRate>(DEFAULT_SCREEN_FPS)
  const [preview, setPreview] = useState<'off' | 'starting' | 'live'>('off')
  const [detached, setDetached] = useState(false), [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState(''), [file, setFile] = useState<{ url: string; name: string }>()
  const stop = useCallback(() => {
    const current = session.current
    session.current = null
    current?.close()
    setPreview('off')
    setDetached(false)
    setRecording(false)
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      session.current?.close()
      session.current = null
      if (savedUrl.current) URL.revokeObjectURL(savedUrl.current)
    }
  }, [])
  useEffect(() => {
    const check = () => {
      if (session.current && (!link || !supported || ((!active || document.hidden) && !session.current.hasAudience))) stop()
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [active, link, supported, detached, recording, stop])

  function save(blob: Blob) {
    const url = URL.createObjectURL(blob), ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    const name = 'Octatrack Screen ' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext
    const download = document.createElement('a')
    download.href = url
    download.download = name
    document.body.append(download)
    download.click()
    download.remove()
    if (mounted.current) {
      if (savedUrl.current) URL.revokeObjectURL(savedUrl.current)
      savedUrl.current = url
      setFile({ url, name })
    } else window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  function start() {
    if (!link || !supported || !canvas.current || session.current) return
    setNotice('')
    try {
      const current = new ScreenSession(link, canvas.current, {
        ready: () => setPreview('live'),
        detached: setDetached,
        recording: on => { if (session.current === current) setRecording(on) },
        saved: save,
        failed: message => { if (session.current === current) { stop(); setNotice(message) } },
      }, fps)
      session.current = current
      setPreview('starting')
      void current.next()
    } catch { setNotice('This browser could not open the screen preview.') }
  }
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  const message = notice || (!link ? 'Connect your Octatrack over USB to preview its screen.' :
    !supported ? 'Screen preview needs a Modwerk base with screen capture support.' :
    recording ? 'Recording the screen on this computer.' :
    preview === 'starting' ? 'Waiting for the Octatrack screen…' : preview === 'live' ? 'Live preview' : 'Preview is off.')
  function action(run: () => void) {
    setNotice('')
    try { run() } catch (error) { setNotice(error instanceof Error ? error.message : 'The browser could not start this action.') }
  }
  return <>
    <h2 className="hub-view-title">Screen</h2>
    <section className="hub-section hub-screen">
      {import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'screen' && <p>Local demo · Recorded Synth module screens</p>}
      <canvas ref={canvas} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} hidden={preview !== 'live'} role="img" aria-label="Live Octatrack LCD" />
      <p role="status">{message}</p>
      <div className="hub-screen-actions">
        <label className="hub-screen-rate">Frame rate
          <select value={fps} disabled={recording} onChange={event => {
            const next = SCREEN_FRAME_RATES.find(rate => String(rate) === event.target.value)
            if (next) { setFps(next); session.current?.setFrameRate(next) }
          }}>
            {SCREEN_FRAME_RATES.map(rate => <option key={rate} value={rate}>{rate} fps</option>)}
          </select>
        </label>
        {preview === 'off' ? <button className="button button-primary" disabled={!link || !supported} onClick={start}><Icon name="play" size={14} />Start preview</button> :
          <button className="button button-quiet" onClick={stop}>Stop preview</button>}
        {preview === 'live' && <>
          <button className="button button-quiet" onClick={() => action(() => session.current?.popOut())}><Icon name="external" size={14} />{detached ? 'Show window' : 'Pop out'}</button>
          {canRecord ? <button className="button button-quiet" onClick={() => action(() => recording ? session.current?.stopRecording() : session.current?.record())}>{recording ? 'Stop recording' : 'Record video'}</button>
            : <span>This browser cannot record canvas video. Use the detached window with OBS.</span>}
        </>}
        {file && <a className="text-button" href={file.url} download={file.name}><Icon name="download" size={14} />Download last video</a>}
      </div>
    </section>
  </>
}
