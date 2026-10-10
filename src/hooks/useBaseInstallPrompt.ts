import { useEffect, useState } from 'react'
import { api, post } from '../community/api'

/**
 * The one-time base install prompt for a verified member: due until they close it,
 * on any device, and opened once the page is visible and no other dialog is open.
 * A failed read keeps it quiet; a failed record lets it show again next visit.
 */
export function useBaseInstallPrompt(memberId: string | null, enabled: boolean) {
  const [due, setDue] = useState(false), [open, setOpen] = useState(false)
  useEffect(() => {
    if (!memberId || !enabled) return
    const controller = new AbortController()
    void api<{ show: boolean }>('/auth/base-install-prompt', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setDue(result.show) }).catch(() => {})
    return () => controller.abort()
  }, [memberId, enabled])
  useEffect(() => {
    if (!due || open || !enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) setOpen(true) }, 1500)
    return () => window.clearInterval(timer)
  }, [due, open, enabled])
  return {
    open: open && !!memberId,
    close() { setDue(false); setOpen(false); void post('/auth/base-install-prompt', {}).catch(() => {}) },
    /** Gone for this visit only, so it returns on the next one. */
    later() { setDue(false); setOpen(false) },
  }
}
