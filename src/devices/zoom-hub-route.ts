import { DEVICES_BY_ID, type DeviceProfile } from './registry'

/** The Zoom pedal page's views (ZoomHub.tsx): `#<machine>/pedal` is Status. */
export type ZoomHubView = 'status' | 'backups' | 'setup'
const PATHS: Record<ZoomHubView, string> = { status: '', backups: '/backups', setup: '/setup' }
export const zoomHubHref = (deviceId: string, view: ZoomHubView = 'status') => '#' + deviceId + '/pedal' + PATHS[view]

/** `#zoom-ms-70cdr/pedal`, `…/pedal/backups`, `…/pedal/setup`: a Zoom machine's pedal page, or undefined. */
export function parseZoomHubRoute(route: string): { device: DeviceProfile; view: ZoomHubView } | undefined {
  const match = /^([a-z0-9-]+)\/pedal(?:\/(backups|setup))?$/.exec(route)
  const device = match && DEVICES_BY_ID[match[1]]
  return device && device.family === 'zoom' ? { device, view: (match![2] as ZoomHubView | undefined) ?? 'status' } : undefined
}
