import { DEVICES_BY_ID, isZd2Pedal, type DeviceProfile } from './registry'

/** The Zoom pedal page's views (ZoomHub.tsx): `#<machine>/pedal` is Status. */
export type ZoomHubView = 'status' | 'backups' | 'setup' | 'set'
const PATHS: Record<ZoomHubView, string> = { status: '', backups: '/backups', setup: '/setup', set: '/set' }
export const zoomHubHref = (deviceId: string, view: ZoomHubView = 'status') => '#' + deviceId + '/pedal' + PATHS[view]

/** `#zoom-ms-70cdr/pedal`, `…/pedal/backups`, `…/pedal/setup`, `…/pedal/set` (the set you edit): a Zoom machine's pedal page, or undefined.
 * The ZD2 pedals have none: the page's link installs ZDL effects into the ZDL pedals' effect list. */
export function parseZoomHubRoute(route: string): { device: DeviceProfile; view: ZoomHubView } | undefined {
  const match = /^([a-z0-9-]+)\/pedal(?:\/(backups|setup|set))?$/.exec(route)
  const device = match && DEVICES_BY_ID[match[1]]
  return device && device.family === 'zoom' && !isZd2Pedal(device) ? { device, view: (match![2] as ZoomHubView | undefined) ?? 'status' } : undefined
}
