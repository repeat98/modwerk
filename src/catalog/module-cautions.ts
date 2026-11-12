// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

/** Modules the owner flags for players before they add them: heavy on the Octatrack's CPU and not yet stable.
 * Shown as a badge on the module card and as a warning on the module page. Remove an entry once the module has been
 * timed on hardware and runs without freezes in real projects. Flagged 12 November 2026 (owner). */
export type ModuleCaution = { badge: string; title: string; detail: string }

const HEAVY = { badge: 'Heavy CPU', title: 'Very CPU-intensive and may still be unstable' }

export const MODULE_CAUTIONS: Readonly<Record<string, ModuleCaution>> = {
  poly8: { ...HEAVY, detail: 'POLY8 alone can use up to about 40 % of the Octatrack’s CPU. With other modules or busy projects it may freeze the panel or stop the audio. Try it in a backed-up project first, and report any freeze.' },
  synth: { ...HEAVY, detail: 'FM Synth computes every voice on the Octatrack’s main processor and has not been timed on hardware yet. With other modules or busy projects it may freeze the panel or stop the audio. Try it in a backed-up project first, and report any freeze.' },
}

export const moduleCaution = (id: string): ModuleCaution | undefined => MODULE_CAUTIONS[id]
