import { useEffect, useSyncExternalStore } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'

/** The link's state for one view. The link listens for the unit while any view is mounted. */
export function useOctatrackLink(link: OctatrackLink) {
  useEffect(() => link.start(), [link])
  return useSyncExternalStore(link.subscribe, link.getState)
}
