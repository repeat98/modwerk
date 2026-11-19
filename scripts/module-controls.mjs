// SPDX-License-Identifier: GPL-3.0-or-later
// An Octatrack effect declares its knobs twice: as Param slots in manifest.py, which the build writes into the
// instrument, and as controls[] in octamod.module.json, which the site shows. This compares the two, so the library
// never describes a knob the unit does not have (module:doctor's "controls" line).

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
