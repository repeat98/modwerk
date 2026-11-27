import { useEffect, useRef, useState } from 'react'
import { FirmwareFeedbackDialog } from '../components/FirmwareFeedbackDialog'
import { useCommunity } from './context'
import { watchHardwareCheckIn } from './hardware-check-in'
import { confirmedFeedback, feedbackId, pendingFeedback, readHardwareFeedback, updateHardwareFeedback, type DownloadedBuild, type HardwareFeedback } from './hardware-feedback'
import { Icon } from '../components/Icon'
import { ModuleIssueDialog } from './ModuleIssueDialog'
import { ConfigurationReportDialog } from './ConfigurationReport'
import { downloadedMachine, downloadedReportContext } from './build-follow-up'
import { MODULE_STATISTICS_CHANGED } from './module-statistics'
import { saveWorkingReports } from './module-works-report'

/** App-wide, so the download page can stay open while the member flashes their device. */
export function HardwareFeedbackCheckIn({ enabled }: { enabled: boolean }) {
  const { session, preview } = useCommunity(), memberId = session.user?.verified ? session.user.id : ''
  if (!memberId || import.meta.env.DEV && preview) return null
  return <MemberHardwareCheckIn key={memberId} memberId={memberId} enabled={enabled}/>
}

function MemberHardwareCheckIn({ memberId, enabled }: { memberId: string; enabled: boolean }) {
  const [active, setActive] = useState<HardwareFeedback | null>(null)
  const showing = useRef(false)
  useEffect(() => {
    return watchHardwareCheckIn(memberId, record => {
      showing.current = true; setActive(record)
    }, () => enabled && !showing.current && document.visibilityState === 'visible'
      && !document.querySelector('dialog[open], .notification-panel, .mobile-menu-panel, .library-machine-menu, .signup-welcome, .selection-warning')
      && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'))
  }, [enabled, memberId])
  if (!active) return null
  return <DownloadedBuildCheckIn key={feedbackId(active)} memberId={memberId} record={active} onClose={() => { showing.current = false; setActive(null) }}/>
}

export function DownloadedBuildCheckIn({ memberId, record, onClose, preview = false }: { memberId: string; record: HardwareFeedback; onClose: () => void; preview?: boolean }) {
  const isPreview = import.meta.env.DEV && preview
  const [reporting, setReporting] = useState(''), [issueReports, setIssueReports] = useState<string[]>([]), [reportingSet, setReportingSet] = useState(false)
  const machine = downloadedMachine(record)
  // Capture the pending choices once. Successful actions stay visible as confirmations until closing.
  const [pendingIds] = useState(() => pendingFeedback(record).map(module => module.id))
  function finish(action: 'dismiss' | 'later') { updateHardwareFeedback(memberId, record, action); onClose() }
  async function confirm(ids: string[]) {
    if (!isPreview) await saveWorkingReports(ids, record)
    updateHardwareFeedback(memberId, record, { completed: ids })
    if (!isPreview) window.dispatchEvent(new Event(MODULE_STATISTICS_CHANGED))
  }
  return <>
    <FirmwareFeedbackDialog build={record} pendingIds={pendingIds} issueReportedIds={issueReports} onConfirm={confirm} onReport={setReporting} onReportSet={machine && !isPreview ? () => setReportingSet(true) : undefined} onLater={() => finish('later')} onClose={() => finish('dismiss')}/>
    {reporting && <ModuleIssueDialog id={reporting} build={record} preview={isPreview} onReported={() => {
      updateHardwareFeedback(memberId, record, { completed: reporting })
      setIssueReports(current => [...new Set([...current, reporting])])
    }} onClose={() => setReporting('')}/>}
    {reportingSet && machine && <ConfigurationReportDialog machine={machine} configurationId="downloaded-build" workspaceContext={downloadedReportContext(record)} onClose={() => setReportingSet(false)}/>}
  </>
}

/** Reopen the same downloaded build's guide without changing the active configuration or navigating. */
export function DownloadedBuildOverview({ build }: { build: DownloadedBuild }) {
  const { session } = useCommunity(), memberId = session.user?.verified ? session.user.id : ''
  const [active, setActive] = useState<HardwareFeedback | null>(null)
  if (!memberId || !build.modules.length) return null
  function open() {
    const record = readHardwareFeedback(memberId).find(item => feedbackId(item) === feedbackId(build))
    setActive(record ?? { ...build, downloadedAt: Date.now(), remindAt: 0, completed: confirmedFeedback(memberId, build), dismissed: false })
  }
  return <section className="configuration-section downloaded-module-overview">
    <div><h2>Your downloaded modules</h2><p className="service-note">Screenshots, usage steps and feedback for the {build.modules.length} {build.modules.length === 1 ? 'module' : 'modules'} in this firmware.</p></div>
    <button type="button" className="button button-quiet" aria-haspopup="dialog" onClick={open}>Open module guide<Icon name="arrow" size={16}/></button>
    {active && <DownloadedBuildCheckIn key={feedbackId(active)} memberId={memberId} record={active} onClose={() => setActive(null)}/>}
  </section>
}
