import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, post } from '../community/api'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { isPublishedBase } from '../engine/elekloader/base-variants'

const noSubscription = () => () => {}
/** What the prompt needs to know of the unit: it runs the current Modwerk base, an older one (including a base this
 * page cannot talk to), it is still being read, or no base is connected. */
export function unitForPrompt(state?: LinkState): 'current' | 'older' | 'connecting' | 'none' {
  // Every USB Audio layout of the published base is current (base-variants.ts).
  if (state?.identity) return isPublishedBase(state.identity.base) ? 'current' : 'older'
  return state?.status === 'ready' ? 'older' : state?.status === 'connecting' ? 'connecting' : 'none'
}

/**
 * The base prompts for a verified member with USB access, opened once the page is visible and no other dialog is open.
 * The install prompt is due until the member's unit has reported any Modwerk base, on any device: only that records it,
 * so it never returns once they have a base. The update prompt needs no record: it opens whenever the connected unit
 * runs an older base, so every base update reaches every tester without a migration. Closing either or Later hides it
 * for this visit. A failed read keeps the install prompt quiet; a failed record lets it show again next visit.
 */
export function useBaseInstallPrompt(memberId: string | null, enabled: boolean, link: OctatrackLink | null = null) {
  const [due, setDue] = useState(false), [open, setOpen] = useState(false), [quiet, setQuiet] = useState(false)
  const unit = useSyncExternalStore(link?.subscribe ?? noSubscription, () => unitForPrompt(link?.getState()), () => 'none')
  useEffect(() => {
    if (!memberId || !enabled) return
    const controller = new AbortController()
    void api<{ show: boolean }>('/auth/base-install-prompt', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setDue(result.show) }).catch(() => {})
    return () => controller.abort()
  }, [memberId, enabled])
  // Recorded once per visit, idempotently; unplugging afterwards must not bring the install prompt back.
  useEffect(() => { if (due && (unit === 'current' || unit === 'older')) void post('/auth/base-install-prompt', {}).catch(() => {}).finally(() => setDue(false)) }, [due, unit])
  const wanted = unit === 'older' || due && unit === 'none'
  useEffect(() => {
    if (!wanted || open || quiet || !enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) setOpen(true) }, 1500)
    return () => window.clearInterval(timer)
  }, [wanted, open, quiet, enabled])
  return {
    open: open && !!memberId,
    /** The connected unit runs an older base: the dialog goes straight to the update steps. */
    update: unit === 'older',
    /** Gone for this visit only, so the prompt returns on the next one while it is still wanted. */
    close() { setQuiet(true); setOpen(false) },
  }
}
