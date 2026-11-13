// The loader's refusals for the developer tools, from the one registry the site reads too
// (sdk/runtime/loader-refusals.json; loader-refusals.test.mjs holds it to loader.h's enum).
import registry from '../sdk/runtime/loader-refusals.json' with { type: 'json' }

export const REFUSALS = registry.refusals
/** Short labels by code, for one-line logs. */
export const REFUSAL_LABELS = REFUSALS.map(refusal => refusal.label)

export const SUBJECTS = registry.subjects
const hex = (value, digits = 0) => '0x' + value.toString(16).padStart(digits, '0')
/** `what` as each kind means it (loader.h runtime_met): a hook index, feature bits, a stock address, a DSP word. */
const WHAT = [() => '', what => String(what), what => hex(what), what => hex(what, 8),
  what => `${['?', 'X', 'Y'][what >>> 24] ?? '?'}:$${(what & 0xffffff).toString(16)}`]
/** "its site at 0x4012e39c patches the same stock code as Euclid (3cbedc9c)" for what a refusal met (the base's
 * REFUSED record, as UsbVendorTransport.refused() reads it); '' for none. `nameOf` names a module by its runtime id, hex. */
export function describeSubject(subject, nameOf = () => undefined) {
  if (!subject?.kind) return ''
  const text = SUBJECTS[subject.kind]?.developer, id = subject.module.toString(16).padStart(8, '0'), name = nameOf(id)
  if (!text) return `it met something this checkout cannot name (kind ${subject.kind}, ${hex(subject.what)}, module ${id})`
  return text.replace('{what}', WHAT[subject.kind](subject.what)).replace('{module}', name ? `${name} (${id})` : 'module ' + id)
}
/** "7 RUNTIME_IN_USE: A track runs the effect ... first." for a code the unit reported; an unknown code keeps its number.
 * With the `subject` of that same refusal, what it met comes first: "3 RUNTIME_CONFLICT: its site at ... . It meets ...". */
export function describeRefusal(code, subject, nameOf) {
  const refusal = REFUSALS[code], met = subject?.refusal === code ? describeSubject(subject, nameOf) : ''
  return refusal ? `${code} ${refusal.name}: ${met ? met + '. ' : ''}${refusal.developer}` : `${code}: not a refusal this checkout knows; the base is newer than it`
}
