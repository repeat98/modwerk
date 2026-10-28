// SPDX-License-Identifier: GPL-3.0-or-later
// Every compatibility.conflicts entry names a module of the same machine. A misspelt id silently allows the pair it
// meant to refuse, and a later module that takes the id would inherit a conflict nobody reviewed.

// shortcut: ids flagged before this check, frozen to the exact version that carries them. Each entry stops applying at
// the module's next version, which must drop them.
export const LEGACY_UNKNOWN_CONFLICTS = {
  'octatrack/analog-bassdrum@0.1.5-experimental': ['machinedrum', 'poly'],
  'octatrack/poly8@0.3.2-experimental': ['octakit'],
  'octatrack/usb-audio-out-tracks-main-cue@0.2.0-experimental': ['usb-audio-out-main', 'usb-audio-out-main-cue', 'usb-audio-out-master', 'usb-audio-out-tracks'],
}

/** Throws for a conflict that names no module in `known` (the machine's module and dependency ids). */
export function requireKnownConflicts(machine, document, known) {
  const legacy = LEGACY_UNKNOWN_CONFLICTS[machine + '/' + document.id + '@' + document.version] ?? []
  const unknown = document.compatibility.conflicts.filter(id => !known.has(id) && !legacy.includes(id))
  if (unknown.length) throw new Error(machine + '/' + document.id + ': compatibility.conflicts names ' + unknown.join(', ') + ', which is not a ' + machine + ' module; flag existing module ids only (docs/module-guides/README.md#flag-every-incompatibility)')
}

/** Throws for two mods of one machine that patch overlapping bytes on a release both support while neither names the
 * other in compatibility.conflicts, so the configurator refuses every such pair by name and none ships unflagged.
 * documents: [{machine, id, compatibility: {conflicts}, patchSites: {release: [{addr, len}]}}]. */
export function requireFlaggedOverlaps(documents) {
  for (const [i, a] of documents.entries()) for (const b of documents.slice(i + 1)) {
    if (a.machine !== b.machine || a.compatibility.conflicts.includes(b.id) || b.compatibility.conflicts.includes(a.id)) continue
    for (const release of Object.keys(a.patchSites).filter(release => release in b.patchSites)) {
      const site = a.patchSites[release].find(x => b.patchSites[release].some(y => Number(x.addr) < Number(y.addr) + y.len && Number(y.addr) < Number(x.addr) + x.len))
      if (site) throw new Error(a.machine + '/' + a.id + ' and ' + b.id + ' both patch ' + site.addr + ' on OS ' + release + ', but neither names the other in compatibility.conflicts. Move one to a core event or other bytes; if they truly cannot share, the newer or updating module flags the older one (docs/module-guides/README.md#flag-every-incompatibility)')
    }
  }
}
