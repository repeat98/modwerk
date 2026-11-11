import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, post } from '../community/api'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { isPublishedBase } from '../engine/elekloader/base-variants'
import { lastInventory } from '../config/inventory'

const noSubscription = () => () => {}
/** What the prompt needs to know of the unit: it runs the current Modwerk base, an older one (including a base this
 * page cannot talk to), the original OS (`stock`), it is still being read, this browser has no WebUSB, or no unit is
 * connected. */
export function unitForPrompt(state?: LinkState): 'current' | 'older' | 'connecting' | 'stock' | 'unsupported' | 'none' {
  // Every USB Audio layout of the published base is current (base-variants.ts).
  if (state?.identity) return isPublishedBase(state.identity.base) ? 'current' : 'older'
  return state?.status === 'ready' ? 'older' : state?.status === 'connecting' ? 'connecting' : state?.status === 'stock' ? 'stock' : state?.status === 'unsupported' ? 'unsupported' : 'none'
}

/** Whether the site was deployed again since this page loaded: the page it serves now loads another entry script. Such a
 * page knows an older published base (the host caches pages for 10 minutes and bases change with deploys), so it must
 * neither call the unit's newer base older nor send its own. Development builds and a failed check count as current. */
export async function siteUpdated() {
  const entry = document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src')
  if (!entry) return false
  try {
    const response = await fetch(location.pathname, { cache: 'no-store' })
    return response.ok && !(await response.text()).includes(entry)
  } catch { return false }
}

/**
 * The base install guide and the update prompt, opened once the page is visible and no other dialog is open.
 * The connected unit is the authority; an account's record is only a hint for when no unit is connected:
 * - The guide (install) opens on the Your Octatrack page (`installHere`) for a unit on the original OS, whatever the
 *   account says, and, with no unit connected, while the member's units have never reported a Modwerk base (the
 *   server's record) or, for a visitor without an account, while this browser has never read a unit with one. A unit
 *   that reports a base records it, so the guide never comes back on its own for a member whose unit has the base.
 * - The update prompt opens wherever the connected unit runs an older base, so every base update reaches everyone
 *   without a migration.
 * Neither opens in a browser without WebUSB: the card build is the way there. Closing either or Later hides it for this
 * visit. A failed read keeps the guide quiet; a failed record lets it show again next visit.
 */
export function useBaseInstallPrompt(memberId: string | null, enabled: boolean, link: OctatrackLink | null = null, installHere = true) {
  const [due, setDue] = useState(false), [open, setOpen] = useState(false), [quiet, setQuiet] = useState(false)
  // A visitor's hint is this browser's: a unit with a base was read here (inventory.ts), now or before.
  const [seenHere, setSeenHere] = useState(() => !!lastInventory())
  const unit = useSyncExternalStore(link?.subscribe ?? noSubscription, () => unitForPrompt(link?.getState()), () => 'none')
  useEffect(() => {
    if (!memberId || !enabled) return
    const controller = new AbortController()
    void api<{ show: boolean }>('/auth/base-install-prompt', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setDue(result.show) }).catch(() => {})
    return () => controller.abort()
  }, [memberId, enabled])
  // Recorded once per visit, idempotently; unplugging afterwards must not bring the guide back.
  useEffect(() => { if (due && (unit === 'current' || unit === 'older')) void post('/auth/base-install-prompt', {}).catch(() => {}).finally(() => setDue(false)) }, [due, unit])
  const hasBase = unit === 'current' || unit === 'older'
  if (hasBase && !seenHere) setSeenHere(true)
  const hinted = memberId ? due : !seenHere
  const wanted = unit === 'older' || installHere && (unit === 'stock' || hinted && unit === 'none')
  useEffect(() => {
    if (!wanted || open || quiet || !enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) setOpen(true) }, 1500)
    return () => window.clearInterval(timer)
  }, [wanted, open, quiet, enabled])
  return {
    // Once open it stays until closed: the unit changes its answer mid-install (the new base connects, an update restarts it).
    open,
    /** The connected unit runs an older base: the dialog goes straight to the update steps. */
    update: unit === 'older',
    /** Gone for this visit only, so the prompt returns on the next one while it is still wanted. */
    close() { setQuiet(true); setOpen(false) },
    /** Set aside while the member signs in (the guide's build gate): not an answer, so it opens again while still wanted. */
    pause() { setOpen(false) },
  }
}
