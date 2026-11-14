// SPDX-License-Identifier: GPL-3.0-or-later
// The step base: the published base of 13 November 2026 (4e9a87ea…), kept as it was. A base stages the next base's
// image in RAM for the update's trial, and takes only what its own stage holds: 1.25 MiB on every base before this
// one, 1.5 MiB from it on (boot.h BOOT_IMAGE_BYTES; a unit reports it as its upload capacity). A base too big for
// the unit's stage is installed in two updates: this one first, which every base takes, then the current one.
// The three assets (octatrack-base-step.elemod, -fills.json, -variants.json) are copies of that base's package and
// are never regenerated; base-step.test.ts pins them. A later base with a larger stage replaces them the same way.
import type { BaseLayout } from './base-variants.ts'

/** The layout the step package itself is; every other layout is a patch against it. */
export const STEP_DEFAULT_LAYOUT: BaseLayout = 'tracks-main-cue'
/** The step base's identity per USB Audio layout (what the unit reports once it runs it). */
export const STEP_IDENTITIES: Record<BaseLayout, string> = {
  'tracks-main-cue': '4e9a87ea6d84077ed4d5e592211a2206a665b0c72ae577e38be6bb133b33104d',
  tracks: '44078eb9c5e26df2728edc20fdb4c73e2cb9f6b7a6b57df68ccbb30e1f30123c',
  'tracks-post': '73c2da347f659b2fd38755de830cb78433117bf2792de3db23e57a23d5d1eff4',
  'main-cue': 'e290dd3697bb75906617a65a7d828c86858cfb2c51b3ce77103b9556dbb51e35',
  main: '74164d5280044dca299aeec7cdebd318109f7f0ebcb80f4ec3da702b0412156c',
  master: '41d73ef255cb3759a94b53d657e9ca84544a5297e556abf82d4e4fea7846c559',
  off: 'c1f21351db3ec855bde25c177a986a209eb3d95d2f0f1778579ae373108d8716',
}
/** SHA-256 of the three assets, so a copy that drifted is refused before anything is built from it. */
export const STEP_ASSETS = {
  package: 'b6692234166bb57c1700e3911d362f26becaa56db70e46c85de6111ae7734e9e',
  fills: '96fa79bb100b3471cdbe88d4cfa857c208ad0641347c0c3317908938138d3795',
  variants: '75c47dddad40aeff1b244c17bd077a416227d49db4cae1d85a00d1ed24fbeb63',
} as const
