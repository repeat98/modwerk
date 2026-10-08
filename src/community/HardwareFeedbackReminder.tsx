import { useEffect, useId, useState } from 'react'
import { BuildFollowUp } from './BuildFollowUp'
import { useCommunity } from './context'
import { dueHardwareFeedback, FEEDBACK_CHANGED, feedbackId, pendingFeedback, updateHardwareFeedback, type HardwareFeedback } from './hardware-feedback'
import { Icon } from '../components/Icon'

/** Recheck on a return to the page, rather than interrupting an active session with a timer or popup. */
export function HardwareFeedbackReminder() {
  const { session } = useCommunity(), memberId = session.user?.verified ? session.user.id : ''
  const [loaded, setLoaded] = useState<{ memberId: string; record?: HardwareFeedback } | null>(null)
  const heading = useId()
  const [posted, setPosted] = useState<{ memberId: string } | null>(null)
  const [reportOwner, setReportOwner] = useState('')
  useEffect(() => {
    if (!posted) return
    function clear() { setPosted(null) }
    const timer = window.setTimeout(clear, 6000)
    window.addEventListener('hashchange', clear)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('hashchange', clear)
    }
  }, [posted])
  useEffect(() => {
    // Keep a successful issue dialog mounted until its close action, even when that was the last pending module.
    function refresh() { if (document.visibilityState !== 'hidden' && reportOwner !== memberId) setLoaded({ memberId, record: dueHardwareFeedback(memberId) }) }
    refresh()
    window.addEventListener(FEEDBACK_CHANGED, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('hashchange', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(FEEDBACK_CHANGED, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('hashchange', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [memberId, reportOwner])
  const record = memberId && loaded?.memberId === memberId ? loaded.record : undefined
  const confirmation = memberId && posted?.memberId === memberId ? <p className="hardware-feedback-confirmation" role="status"><Icon name="check" size={15}/>Reported working.<button type="button" className="icon-button" aria-label="Dismiss feedback confirmation" onClick={() => setPosted(null)}><Icon name="close" size={15}/></button></p> : null
  if (!record) return confirmation
  const id = feedbackId(record), modules = pendingFeedback(record)
  return <section className="configuration-section hardware-feedback-reminder" aria-labelledby={heading}>
    <div className="section-title"><h2 id={heading}>Tried your {record.machine} modules?</h2><button type="button" className="icon-button" aria-label="Dismiss feedback reminder for this build" onClick={() => { setPosted(null); updateHardwareFeedback(memberId, record, 'dismiss') }}><Icon name="close" size={16}/></button></div>
    <BuildFollowUp key={id} machine={record.machine} os={record.os} modules={record.modules} pendingIds={modules.map(module => module.id)} onSaved={() => setPosted({ memberId })} onReportOpenChange={open => setReportOwner(open ? memberId : '')} embedded />
    {confirmation}
    <button type="button" className="text-button hardware-feedback-later" onClick={() => { setPosted(null); updateHardwareFeedback(memberId, record, 'later') }}>Not yet — remind me tomorrow</button>
  </section>
}
