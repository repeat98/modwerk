import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { rememberInventory, type Inventory } from '../config/inventory'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { MissingModule } from '../engine/elekloader/upload-usb'

/** The site's one link to the Octatrack, or null where there is no USB workflow (phones, flag off). */
export const OctatrackLinkContext = createContext<OctatrackLink | null>(null)
const noSubscription = () => () => {}

const UNSUPPORTED: LinkState = { status: 'unsupported' }, unsupported = () => UNSUPPORTED
/** The link's state for one view (unsupported without a link). The link listens for the unit while any view is mounted. */
export function useOctatrackLink(link: OctatrackLink | null) {
  useEffect(() => link?.start(), [link])
  return useSyncExternalStore(link?.subscribe ?? noSubscription, link?.getState ?? unsupported, link?.getState ?? unsupported)
}

/** Whether an Octatrack with the Modwerk base is connected; re-renders only when that changes. `given` is for the provider's own component. */
export function useOctatrackBase(given?: OctatrackLink | null) {
  const fromContext = useContext(OctatrackLinkContext), link = given === undefined ? fromContext : given
  const connected = () => !!link?.getState().identity?.canSubmit
  return useSyncExternalStore(link?.subscribe ?? noSubscription, connected, connected) // server renders (tests, prerender) need a snapshot too
}

/** What the connected unit has on it, read again whenever its module set changes; undefined while unknown,
 * loading or disconnected. Re-renders only when the unit or its set changes, so the whole app can use it. */
export function useInventory(link?: OctatrackLink | null, read?: () => Promise<Inventory>) {
  const unitKey = () => { const state = link?.getState(); return state?.status === 'ready' && state.identity?.canSubmit ? state.identity.base + '|' + (state.active ?? '') : '' }
  const key = useSyncExternalStore(link?.subscribe ?? noSubscription, unitKey, unitKey)
  const [inventory, setInventory] = useState<{ key: string; value: Inventory }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!key || !read) return
    let live = true, again: ReturnType<typeof setTimeout> | undefined
    // A read that couldn't ask just now (another tab, a moment of USB trouble) tries again; any other failure is final.
    read().then(value => { rememberInventory(key.split('|')[0], value); if (live) setInventory({ key, value }) },
      error => { if ((error as { retry?: boolean })?.retry) again = setTimeout(() => { if (live) setAttempt(n => n + 1) }, 2000); else console.error(error) })
    return () => { live = false; clearTimeout(again) }
  }, [key, read, attempt])
  // A module switched on or off on the unit itself (PROJECT > MODWERK > MODULES) changes what runs without a sync:
  // the identity of the running set is asked every 5 s while the unit is idle, and a change reads the modules again.
  useEffect(() => {
    if (!key || !link || !read) return
    let live = true, seen: string | undefined
    const timer = setInterval(() => { void link.liveSet().then(now => { if (!live || !now) return; if (seen && now !== seen) setAttempt(n => n + 1); seen = now }) }, 5000)
    return () => { live = false; clearInterval(timer) }
  }, [key, link, read])
  return key && inventory?.key === key ? inventory.value : undefined
}

/** The modules the connected unit's project names that are not installed, read every 3 s while it is idle (a
 * project can be loaded on the unit at any time); [] while unknown. Re-renders only when the list changes. */
export function useMissing(link?: OctatrackLink | null) {
  const idle = () => { const state = link?.getState(); return state?.status === 'ready' && !!state.identity?.canSubmit }
  const live = useSyncExternalStore(link?.subscribe ?? noSubscription, idle, idle)
  const [missing, setMissing] = useState<MissingModule[]>([])
  useEffect(() => {
    if (!live || !link) return
    let on = true
    const read = () => void link.missing().then(list => { if (on && list) setMissing(old => JSON.stringify(old) === JSON.stringify(list) ? old : list) })
    read()
    const timer = setInterval(read, 3000)
    return () => { on = false; clearInterval(timer) }
  }, [live, link])
  return live ? missing : []
}
