// The loader's refusals for the developer tools, from the one registry the site reads too
// (sdk/runtime/loader-refusals.json; loader-refusals.test.mjs holds it to loader.h's enum).
import registry from '../sdk/runtime/loader-refusals.json' with { type: 'json' }

export const REFUSALS = registry.refusals
/** Short labels by code, for one-line logs. */
export const REFUSAL_LABELS = REFUSALS.map(refusal => refusal.label)

/** "7 RUNTIME_IN_USE: A track runs the effect ... first." for a code the unit reported; an unknown code keeps its number. */
export function describeRefusal(code) {
  const refusal = REFUSALS[code]
  return refusal ? `${code} ${refusal.name}: ${refusal.developer}` : `${code}: not a refusal this checkout knows; the base is newer than it`
}
