import { HttpError } from './security'
import { validateDiagnostic } from './octatrack-diagnostics'
import { DIAGNOSTIC_USB_EVENTS } from '../src/community/octatrack-diagnostics-contract'
import { SUPPORT_ATTACHED_EVENTS, SUPPORT_LAYOUTS, type SupportAttachment, type SupportEvent } from '../src/community/support-report'

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
/** validateDiagnostic wants a record id; an attached event has none of its own. */
const NO_ID = '00000000-0000-4000-8000-000000000000'
/** The link's own events: no device log (the collector reads that, not the link) and no browser or build events. */
const LINK_EVENTS: readonly string[] = [...DIAGNOSTIC_USB_EVENTS.filter(event => event !== 'device_log'), 'link_failed']
const refuse = (): never => { throw new HttpError(400, 'The attached USB events are unreadable. Remove them and post the report again.') }
const checked = (record: Record<string, unknown>) => { try { return validateDiagnostic({ id: NO_ID, ...record }) } catch { return refuse() } }

/**
 * USB events a member attached to a problem report (support-report.ts): the trail's records, each held to the shared
 * diagnostics' field rules (validateDiagnostic), with when the page saw it, plus the unit's base, version, layout, model
 * text and running set, and the browser family. Anything else is refused, so no free text reaches the issue.
 */
export function validateSupportAttachment(value: unknown): SupportAttachment {
  if (!object(value) || value.schema !== 1 || !Object.keys(value).every(key => ['schema', 'unit', 'client', 'events'].includes(key))) return refuse()
  const { unit, client, events } = value
  if (unit !== undefined && !(object(unit) && Object.keys(unit).every(key => ['base', 'version', 'layout', 'model', 'active'].includes(key)) && hash(unit.base)
    && (unit.version === undefined || typeof unit.version === 'string' && /^[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}$/.test(unit.version))
    && (unit.layout === undefined || SUPPORT_LAYOUTS.includes(unit.layout as string))
    && (unit.model === undefined || typeof unit.model === 'string' && /^[A-Za-z0-9 ._+-]{1,16}$/.test(unit.model))
    && (unit.active === undefined || hash(unit.active)))) return refuse()
  if (client !== undefined) checked({ event: 'connected', phase: 'ready', client })
  if (!Array.isArray(events) || !events.length || events.length > SUPPORT_ATTACHED_EVENTS) return refuse()
  const list = events.map(entry => {
    if (!object(entry) || typeof entry.at !== 'string' || entry.at.length > 30 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(entry.at) || !Number.isFinite(Date.parse(entry.at))) return refuse()
    const { at, ...record } = entry
    if (!LINK_EVENTS.includes(record.event as string) || 'modules' in record || 'client' in record) return refuse()
    checked(record)
    return { at, ...record } as SupportEvent
  })
  return { schema: 1, ...(unit ? { unit: unit as unknown as SupportAttachment['unit'] } : {}), ...(client ? { client: client as SupportAttachment['client'] } : {}), events: list }
}
