import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

/** Select the introduction when someone chooses Install. A connected unit takes precedence over saved history. */
export function useFirstBaseInstall(memberId: string | null, link: OctatrackLink | null) {
  const reportedMember = useRef<string | null>(null)
  const [record, setRecord] = useState<{ member: string; first: boolean }>()
  const [seenHere, setSeenHere] = useState(() => !!lastInventory())
  const unit = useSyncExternalStore(link?.subscribe ?? noSubscription, () => unitForPrompt(link?.getState()), () => 'none')
  const hasBase = unit === 'current' || unit === 'older'
  if (hasBase && !seenHere) setSeenHere(true)
  useEffect(() => {
    if (!memberId || !link) return
    const controller = new AbortController()
    void api<{ show: boolean }>('/auth/base-install-prompt', { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setRecord({ member: memberId, first: result.show })
    }).catch(() => {})
    return () => controller.abort()
  }, [memberId, link])
  useEffect(() => {
    if (!memberId || record?.member !== memberId || !record.first || !hasBase || reportedMember.current === memberId) return
    reportedMember.current = memberId
    void post('/auth/base-install-prompt', {}).catch(() => {}).finally(() => {
      setRecord(current => current?.member === memberId ? { member: memberId, first: false } : current)
    })
  }, [memberId, record, hasBase])
  if (unit === 'stock') return true
  if (hasBase) return false
  return memberId && record?.member === memberId ? record.first : !seenHere
}
