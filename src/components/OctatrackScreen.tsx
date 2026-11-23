import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { adoptSession, DEFAULT_SCREEN_FPS, keptSession, leaveSession, SCREEN_FRAME_RATES, ScreenSession, type Events, type ScreenFrameRate, VIDEO_HEIGHT, VIDEO_WIDTH } from './octatrack-screen-session'
import { Icon } from './Icon'

function download(blob: Blob) {
  const url = URL.createObjectURL(blob), ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const name = 'Octatrack Screen ' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  return { url, name }
}
const saveAway = (blob: Blob) => { const { url } = download(blob); window.setTimeout(() => URL.revokeObjectURL(url), 60000) }

export function OctatrackScreen({ active, link, unavailable }: {
  active: boolean
  link: OctatrackLink | null
  unavailable?: { title: string; detail?: ReactNode; action?: ReactNode }
}) {
  const host = useRef<HTMLDivElement>(null)
  const session = useRef<ScreenSession | null>(null)
  const mounted = useRef(false)
  const savedUrl = useRef('')
  // A session still popped out from an earlier visit is adopted on mount (below).
  const [fps, setFps] = useState<ScreenFrameRate>(() => keptSession()?.fps ?? DEFAULT_SCREEN_FPS)
  const [preview, setPreview] = useState<'off' | 'starting' | 'live'>(() => keptSession() ? 'live' : 'off')
  const [detached, setDetached] = useState(() => !!keptSession()), [recording, setRecording] = useState(() => !!keptSession()?.recording)
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
    const back = adoptSession()
    if (back) own(back)
    return () => {
      mounted.current = false
      const current = session.current
      session.current = null
      if (current) leaveSession(current, saveAway)
      if (savedUrl.current) URL.revokeObjectURL(savedUrl.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once per mount; own only uses state setters and refs
  useEffect(() => {
    const check = () => {
      if (session.current && (!link || ((!active || document.hidden) && !session.current.hasAudience))) stop()
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [active, link, detached, recording, stop])

  function save(blob: Blob) {
    if (!mounted.current) return saveAway(blob)
    const file = download(blob)
    if (savedUrl.current) URL.revokeObjectURL(savedUrl.current)
    savedUrl.current = file.url
    setFile(file)
  }
  const events = (current: () => ScreenSession): Events => ({
    ready: () => setPreview('live'),
    detached: setDetached,
    recording: on => { if (session.current === current()) setRecording(on) },
    saved: save,
    failed: message => { if (session.current === current()) { stop(); setNotice(message) } },
  })
  function own(current: ScreenSession) {
    session.current = current
    current.events = events(() => current)
    current.canvas.hidden = false
    host.current?.replaceChildren(current.canvas)
  }
  function start() {
    if (!link || !host.current || session.current) return
    setNotice('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = VIDEO_WIDTH
      canvas.height = VIDEO_HEIGHT
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', 'Live Octatrack LCD')
      const current: ScreenSession = new ScreenSession(link, canvas, events(() => current), fps)
      own(current)
      setPreview('starting')
      void current.next()
    } catch { setNotice('This browser could not open the screen preview.') }
  }
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  const live = !!link && preview === 'live'
  const starting = !!link && preview === 'starting'
  const status = notice || (live ? (recording ? 'Recording the screen on this computer.' : 'Live preview') : starting ? 'Waiting for the first frame…' : '')
  function action(run: () => void) {
    setNotice('')
    try { run() } catch (error) { setNotice(error instanceof Error ? error.message : 'The browser could not start this action.') }
  }
  return <>
    <h2 className="hub-view-title">Screen</h2>
    <section className="hub-section hub-screen" aria-label="Screen preview">
      {import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'screen' && <p className="hub-screen-demo">Local demo · Recorded Synth module screens</p>}
      <div className="hub-screen-display">
        <div ref={host} className="hub-screen-canvas" hidden={!live} />
        {!live && <div className="hub-screen-empty">
          <span className="hub-screen-mark"><Icon name="display" size={24} /></span>
          <h3>{unavailable?.title ?? (starting ? 'Waiting for the first frame…' : 'Preview is off')}</h3>
          {unavailable?.detail && <p>{unavailable.detail}</p>}
          {unavailable?.action}
        </div>}
      </div>
      {link && <div className="hub-screen-actions">
        {live && <span className={'hub-screen-live' + (recording ? ' is-recording' : '')} aria-hidden="true">
          <span className="unit-led is-on" />{recording ? 'Recording' : 'Live preview'}
        </span>}
        <div className="hub-screen-controls">
          <label className="hub-screen-rate">Frame rate
            <select value={fps} disabled={recording} onChange={event => {
              const next = SCREEN_FRAME_RATES.find(rate => String(rate) === event.target.value)
              if (next) { setFps(next); session.current?.setFrameRate(next) }
            }}>
              {SCREEN_FRAME_RATES.map(rate => <option key={rate} value={rate}>{rate} fps</option>)}
            </select>
          </label>
          <button type="button" className={'button ' + (preview === 'off' ? 'button-primary' : 'button-quiet')} onClick={preview === 'off' ? start : stop}>
            {preview === 'off' ? <><Icon name="play" size={14} />Start preview</> : 'Stop preview'}
          </button>
          {live && <>
            <button type="button" className="button button-quiet" onClick={() => action(() => session.current?.popOut())}><Icon name="external" size={14} />{detached ? 'Show window' : 'Pop out'}</button>
            {canRecord && <button type="button" className="button button-quiet" onClick={() => action(() => recording ? session.current?.stopRecording() : session.current?.record())}>{recording ? 'Stop recording' : 'Record video'}</button>}
          </>}
        </div>
      </div>}
      <p role="status" className={notice ? 'hub-screen-notice' : 'sr-only'}>{status}</p>
      {live && !canRecord && <p className="hub-screen-note">To record in this browser, pop out the preview and capture the window in OBS.</p>}
      {file && <a className="text-button hub-screen-download" href={file.url} download={file.name}><Icon name="download" size={14} />Download last video</a>}
    </section>
  </>
}
