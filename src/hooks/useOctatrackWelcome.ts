import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../community/api'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { lastInventory } from '../config/inventory'
import { unitForPrompt } from './useBaseInstallPrompt'

// shortcut: one record per browser for everyone, member or visitor: there is no per-member record for this without a new
// table, so a member sees it again in another browser. A later announcement needs a new key.
export const OCTATRACK_WELCOME_KEY = 'modwerk.octatrack-welcome:2026-11-11', KEY = OCTATRACK_WELCOME_KEY
const noSubscription = () => () => {}
export function welcomeSeen() { try { return localStorage.getItem(KEY) === 'seen' } catch { return false } }
function rememberWelcome() { try { localStorage.setItem(KEY, 'seen') } catch { /* Seen for this visit when storage is blocked. */ } }

/**
 * The welcome to modules over USB (OctatrackWelcome.tsx), once, for whoever has never had the Modwerk base. It uses the
 * base install prompt's authority (useBaseInstallPrompt): a connected unit with a base, a member's units that reported
 * one (the server's record) or, for a visitor, a unit with one read in this browser all mean there is a base, and the
 * welcome never shows. `released` is the release switch; `here` the pages it may open on. It opens once the tab is
 * visible and no other dialog is open (checked every 1.5 s, as the guide's prompt is), and is answered for good in this browser by any choice (`close`).
 * - `due`: it is still to be shown (also while a member's record is being read), so other prompts wait.
 * - `shown`: it opened on this visit, so other prompts keep away until the next one.
 */
export function useOctatrackWelcome(memberId: string | null, released: boolean, here: boolean, link: OctatrackLink | null) {
  const [seen, setSeen] = useState(welcomeSeen), [open, setOpen] = useState(false), [shown, setShown] = useState(false)
  // The member's record: whether their units never reported a base (true), read once per member.
  const [record, setRecord] = useState<{ memberId: string; never: boolean }>(), never = record && record.memberId === memberId ? record.never : undefined
  const unit = useSyncExternalStore(link?.subscribe ?? noSubscription, () => unitForPrompt(link?.getState()), () => 'none')
  useEffect(() => {
    if (!released || !memberId || welcomeSeen()) return
    const controller = new AbortController()
    // A failed read keeps it quiet, like the guide's prompt.
    void api<{ show: boolean }>('/auth/base-install-prompt', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setRecord({ memberId, never: result.show }) }).catch(() => { if (!controller.signal.aborted) setRecord({ memberId, never: false }) })
    return () => controller.abort()
  }, [released, memberId])
  const hasBase = unit === 'current' || unit === 'older' || (memberId ? never === false : !!lastInventory())
  const due = released && !seen && !hasBase
  const ready = due && (!memberId || never === true)
  useEffect(() => {
    if (!ready || !here || open) return
    const show = () => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) { setOpen(true); setShown(true) } }
    const timer = window.setInterval(show, 1500)
    return () => window.clearInterval(timer)
  }, [ready, here, open])
  return {
    // A unit read meanwhile with a base ends it: it was never for them.
    open: open && !hasBase, due, shown: shown && !hasBase,
    /** Any answer: it doesn't come back by itself, in this browser. */
    close() { rememberWelcome(); setSeen(true); setOpen(false) },
    /** From the hub's Setup: shown again on request, whatever was answered before. */
    show() { setOpen(true); setShown(true) },
  }
}
