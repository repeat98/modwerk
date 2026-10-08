import { claimHardwareCheckIn, FEEDBACK_CHANGED, hardwareFeedbackLock, nextHardwareCheckIn, type HardwareFeedback } from './hardware-feedback'

/** Watches the saved deadline, including across navigation, sleep and a return to the tab. */
export function watchHardwareCheckIn(memberId: string, onDue: (record: HardwareFeedback) => void, canOpen: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined, cancelled = false, checking = false
  function check() {
    clearTimeout(timer); timer = undefined
    if (cancelled || checking) return
    const record = nextHardwareCheckIn(memberId)
    if (!record) return
    const wait = record.checkInAt! - Date.now()
    if (wait > 0) { timer = setTimeout(check, Math.min(wait, 2147483647)); return }
    if (!canOpen()) return
    checking = true
    const claim = () => {
      if (cancelled || !canOpen()) return
      const claimed = claimHardwareCheckIn(memberId, record)
      if (claimed) onDue(claimed)
    }
    // Storage is checked again inside the shared lock, so two visible tabs cannot both open it.
    const request = navigator.locks ? navigator.locks.request(hardwareFeedbackLock(memberId), claim) : Promise.resolve().then(claim)
    void request.catch(() => {}).finally(() => { checking = false })
  }
  const observer = new MutationObserver(check)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class'] })
  const events = [FEEDBACK_CHANGED, 'storage', 'focus', 'hashchange']
  events.forEach(event => window.addEventListener(event, check))
  document.addEventListener('visibilitychange', check)
  document.addEventListener('focusin', check); document.addEventListener('focusout', check)
  check()
  return () => {
    cancelled = true; clearTimeout(timer); observer.disconnect()
    events.forEach(event => window.removeEventListener(event, check))
    document.removeEventListener('visibilitychange', check)
    document.removeEventListener('focusin', check); document.removeEventListener('focusout', check)
  }
}
