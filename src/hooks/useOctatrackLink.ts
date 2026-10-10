import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'

/** The site's one link to the Octatrack, or null where there is no USB workflow (phones, flag off). */
export const OctatrackLinkContext = createContext<OctatrackLink | null>(null)
const noSubscription = () => () => {}

/** The link's state for one view. The link listens for the unit while any view is mounted. */
export function useOctatrackLink(link: OctatrackLink) {
  useEffect(() => link.start(), [link])
  return useSyncExternalStore(link.subscribe, link.getState)
}

/** Whether an Octatrack with the Modwerk base is connected; re-renders only when that changes. */
export function useOctatrackBase() {
  const link = useContext(OctatrackLinkContext)
  return useSyncExternalStore(link?.subscribe ?? noSubscription, () => !!link?.getState().identity?.canSubmit)
}
