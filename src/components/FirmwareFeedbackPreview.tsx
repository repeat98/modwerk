import { useEffect, useRef, useState } from 'react'
import { builtModules } from '../community/build-follow-up'
import { DownloadedBuildCheckIn } from '../community/HardwareFeedbackCheckIn'
import { watchHardwareCheckIn } from '../community/hardware-check-in'
import { CHECK_IN_DELAY, forgetHardwareFeedback, rememberHardwareFeedback, type DownloadedBuild, type HardwareFeedback } from '../community/hardware-feedback'
import { Icon } from './Icon'
import { ReportingPreviewContext } from './ReportingPreviewContext'

const previewMachine = new URLSearchParams(window.location.search).get('guide-machine')
const build: DownloadedBuild = previewMachine === 'digitakt'
  ? { machine: 'Digitakt', os: '1.54', modules: builtModules(['digitakt-digimono', 'digitakt-digiutils', 'digitakt-digisophie']) }
  : { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapeecho', 'euclid', 'repitch', 'vector', 'synth']) }
const memberId = 'local-post-download-check-in-preview'

/** DEV-only fixture: same scheduler and dialog as production, with no firmware or report requests. */
export default function FirmwareFeedbackPreview() {
  const [active, setActive] = useState<HardwareFeedback | null>(null), [waiting, setWaiting] = useState(false), [notice, setNotice] = useState('')
  const showing = useRef(false)
  function schedule(delay: number) {
    showing.current = false; setActive(null); setWaiting(delay > 0)
    setNotice(delay ? 'Simulated download started. The guide opens in two seconds.' : '')
    if (!delay) forgetHardwareFeedback(memberId)
    // Exercise the production deadline without downloading firmware.
    rememberHardwareFeedback(memberId, build, Date.now() - CHECK_IN_DELAY + delay)
  }
  useEffect(() => {
    forgetHardwareFeedback(memberId)
    rememberHardwareFeedback(memberId, build, Date.now() - CHECK_IN_DELAY)
    const stop = watchHardwareCheckIn(memberId, record => {
      showing.current = true; setActive(record); setWaiting(false)
    }, () => !showing.current && document.visibilityState === 'visible' && !document.querySelector('dialog[open]'))
    return () => { stop(); forgetHardwareFeedback(memberId) }
  }, [])
  return <ReportingPreviewContext>
    <aside className="firmware-feedback-preview" aria-label="Firmware feedback preview controls">
      <div><strong>Post-download module guide · local preview</strong><p>The overview opens 2 seconds after every download, when the tab is visible. This preview uses the same scheduler with a disposable local fixture. No firmware or reports are sent.</p></div>
      <button type="button" className="button button-quiet" disabled={waiting} onClick={() => schedule(CHECK_IN_DELAY)}><Icon name="download" size={15}/>{waiting ? 'Guide in 2 seconds…' : 'Simulate download · 2 s'}</button>
      <button type="button" className="button button-primary" onClick={() => schedule(0)}>Open check-in<Icon name="arrow" size={15}/></button>
      {notice && <p className="firmware-feedback-preview-notice" role="status">{notice}</p>}
    </aside>
    {active && <DownloadedBuildCheckIn key={active.downloadedAt} memberId={memberId} record={active} preview onClose={() => { showing.current = false; setActive(null) }}/>}
    <a className="text-button" href="/?preview=reporting" onClick={event => { event.preventDefault(); window.location.assign(event.currentTarget.href) }}>Compare every reporting flow side by side →</a>
  </ReportingPreviewContext>
}
