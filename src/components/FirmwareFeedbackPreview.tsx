import { useEffect, useRef, useState } from 'react'
import { builtModules } from '../community/build-follow-up'
import type { DownloadedBuild } from '../community/hardware-feedback'
import { FirmwareFeedbackDialog } from './FirmwareFeedbackDialog'
import { Icon } from './Icon'
import { ModuleIssueDialog } from '../community/ModuleIssueDialog'
import { ReportingPreviewContext } from './ReportingPreviewContext'

const build: DownloadedBuild = { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapehead', 'euclid']) }

/** DEV-only interaction preview: no firmware, storage, reports or notification requests. */
export default function FirmwareFeedbackPreview() {
  const [open, setOpen] = useState(true), [reporting, setReporting] = useState(''), [waiting, setWaiting] = useState(false), [notice, setNotice] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  function show() { window.clearTimeout(timer.current); setWaiting(false); setNotice(''); setOpen(true) }
  function simulateDownload() {
    window.clearTimeout(timer.current); setOpen(false); setWaiting(true); setNotice('Simulated download started. The check-in opens in eight seconds.')
    timer.current = window.setTimeout(show, 8000)
  }
  return <ReportingPreviewContext>
    <aside className="firmware-feedback-preview" aria-label="Firmware feedback prototype controls">
      <div><strong>Post-download check-in · local prototype</strong><p>Proposed delay: 5 minutes after download, when the tab is visible. Preview only — nothing is downloaded or sent.</p></div>
      <button type="button" className="button button-quiet" disabled={waiting} onClick={simulateDownload}><Icon name="download" size={15}/>{waiting ? 'Check-in in 8 seconds…' : 'Simulate download · 8 s'}</button>
      <button type="button" className="button button-primary" onClick={show}>Open check-in<Icon name="arrow" size={15}/></button>
      {notice && <p className="firmware-feedback-preview-notice" role="status">{notice}</p>}
    </aside>
    {open && <FirmwareFeedbackDialog build={build} onConfirm={async ids => { setNotice('Preview: working confirmation for ' + build.modules.filter(module => ids.includes(module.id)).map(module => module.name).join(', ') + '. Nothing was sent.') }} onReport={setReporting} onLater={() => { setOpen(false); setNotice('Preview: remind me tomorrow. Nothing was scheduled.') }} onClose={() => setOpen(false)}/>}
    {reporting && <ModuleIssueDialog id={reporting} build={build} preview onClose={() => setReporting('')}/>}
    <a className="text-button" href="/?preview=reporting" onClick={event => { event.preventDefault(); window.location.assign(event.currentTarget.href) }}>Compare every reporting flow side by side →</a>
  </ReportingPreviewContext>
}
