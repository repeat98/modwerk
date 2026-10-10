import { OctatrackLinkPanel } from '../components/OctatrackLinkPanel'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { fakeSession, fakeUnit } from './octatrack-link-fake'

// Once per page load: StrictMode runs state initializers twice, and the console handle must reach the unit in use.
const kind = new URLSearchParams(window.location.search).get('unit'), unit = fakeUnit(kind === 'stock' || kind === 'none' ? kind : 'base')
const link = new OctatrackLink(unit.usb, fakeSession(unit, 60))
Object.assign(window, { modwerkUsbPreview: unit })

/**
 * DEV-only (`?preview=usb-link&unit=base|stock|none`): the USB card and install guide
 * against a pretend unit, no WebUSB needed. Drive it from the console through
 * `modwerkUsbPreview`: plug('base' | 'stock'), unplug(), playing = true, taken = true.
 * No pretend buildBase: a preview must never save a file that looks like firmware.
 */
export default function OctatrackLinkPreview(props: { guideSlot: HTMLElement | null; firmwareReady: boolean }) {
  return <OctatrackLinkPanel {...props} link={link} />
}
