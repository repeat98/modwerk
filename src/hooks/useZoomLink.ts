import { useEffect, useSyncExternalStore } from 'react'
import type { ZoomLink, ZoomLinkState } from '../engine/zoom/zoom-link'

const UNSUPPORTED: ZoomLinkState = { status: 'unsupported' }, unsupported = () => UNSUPPORTED, noSubscription = () => () => {}
/** The Zoom link's state for one view (unsupported without a link). The link connects by itself where MIDI is already allowed. */
export function useZoomLink(link: ZoomLink | null) {
  useEffect(() => link?.start(), [link])
  return useSyncExternalStore(link?.subscribe ?? noSubscription, link?.getState ?? unsupported, link?.getState ?? unsupported)
}
