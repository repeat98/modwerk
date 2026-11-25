// SPDX-License-Identifier: GPL-3.0-or-later
// An Octatrack effect declares its knobs twice: as Param slots in manifest.py, which the build writes into the
// instrument, and as controls[] in octamod.module.json, which the site shows. This compares the two, so the library
// never describes a knob the unit does not have (module:doctor's "controls" line).

// Words a select may not name itself with: the mode select's knob shows its value's word in place of its own name
// (sdk/octabam/tools/build/mode_names.py, with_selfname), so OFF / ON left Resonator's COLUN a switch without a name.
const NAMELESS = new Set(['OFF', 'ON', 'NO', 'YES', 'Y', 'N', '-', '0', '1', 'X'])

/** How each knob is drawn against what it holds (docs/module-guides/effects.md#choose-the-widget), one sentence a
 * problem; [] when every knob is drawn as what it is. A count left to the donor (null) is not judged. */
export function widgetProblems(native) {
  const problems = []
  for (const param of native) {
    const { formatter, count, labels } = param, where = `slot ${param.slot}` + (param.name ? ` (${param.name})` : '')
    if (!formatter || formatter === 'inherit' || count === null || count === undefined) continue
    if (formatter === 'stepped' && count > 5) problems.push(`${where}: a switch for ${count} values; a switch has at most five positions, so use WIDE_STEPPED with labels`)
    else if (formatter === 'stepped' && !labels) problems.push(`${where}: a switch without labels shows numbers; give each position a word`)
    if ((formatter === 'plain' || formatter === 'bipolar') && count >= 2 && count <= 5) problems.push(`${where}: a knob for ${count} values; ${count} choices are a switch (STEPPED with labels)`)
    if (formatter === 'plain' && labels) problems.push(`${where}: a plain knob never draws its labels; use WIDE_STEPPED for a labelled list, or drop the labels`)
    if (param.mode && labels?.some(word => NAMELESS.has(String(word).trim().toUpperCase())))
      problems.push(`${where}: the mode select names itself with its value, so ${labels.map(word => String(word).trim()).join(' / ')} leaves it without a name; use words that say what each mode is (FREE / BEAT, NOTE / COLUN)`)
  }
  return problems
}

/** Mismatches between a module's active native slots ({slot, name, default, count}; null: left to the donor effect)
 * and its controls[], one sentence each; [] when they agree. controls[] lists either exactly the native knobs in slot
 * order, or every slot of the effect it extends (then a native knob is compared with the control at its slot). */
export function controlProblems(native, controls) {
  if (!native.length) return []
  const bySlot = controls.length !== native.length && native.every(param => param.slot < controls.length)
  if (controls.length !== native.length && !bySlot)
    return [`manifest.py declares ${native.length} knob${native.length === 1 ? '' : 's'}, controls[] lists ${controls.length}`]
  const problems = []
  native.forEach((param, index) => {
    const control = controls[bySlot ? param.slot : index], where = `slot ${param.slot}` + (param.name ? ` (${param.name})` : '')
    for (const field of ['name', 'default', 'count'])
      if (param[field] !== null && param[field] !== control[field]) problems.push(`${where}: ${field} is ${JSON.stringify(param[field])} in manifest.py, ${JSON.stringify(control[field])} in controls[]`)
  })
  return problems
}
