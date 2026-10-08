import { useEffect, useRef, useState } from 'react'
import { FirmwareFeedbackDialog } from '../components/FirmwareFeedbackDialog'
import { useCommunity } from './context'
import { watchHardwareCheckIn } from './hardware-check-in'
import { feedbackId, pendingFeedback, updateHardwareFeedback, type HardwareFeedback } from './hardware-feedback'
import { ModuleIssueDialog } from './ModuleIssueDialog'
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
  const [reporting, setReporting] = useState(''), [issueReports, setIssueReports] = useState<string[]>([])
  // Capture the pending choices once. Successful actions stay visible as confirmations until closing.
  const [pendingIds] = useState(() => pendingFeedback(record).map(module => module.id))
  function finish(action: 'dismiss' | 'later') { updateHardwareFeedback(memberId, record, action); onClose() }
  async function confirm(ids: string[]) {
    if (!isPreview) await saveWorkingReports(ids, record)
    updateHardwareFeedback(memberId, record, { completed: ids })
    if (!isPreview) window.dispatchEvent(new Event(MODULE_STATISTICS_CHANGED))
  }
  return <>
    <FirmwareFeedbackDialog build={record} pendingIds={pendingIds} issueReportedIds={issueReports} onConfirm={confirm} onReport={setReporting} onLater={() => finish('later')} onClose={() => finish('dismiss')}/>
    {reporting && <ModuleIssueDialog id={reporting} build={record} preview={isPreview} onReported={() => {
      updateHardwareFeedback(memberId, record, { completed: reporting })
      setIssueReports(current => [...new Set([...current, reporting])])
    }} onClose={() => setReporting('')}/>}
  </>
}
