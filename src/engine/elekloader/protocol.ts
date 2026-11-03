// SPDX-License-Identifier: GPL-3.0-or-later
// The builder's replies as elekloader's kit types them (vendor/elekloader/kit/src/kit/protocol.ts), under the names
// Modwerk's pages use.
export type {
  Device as BuilderDevice, Stock as BuilderStock, Mod as BuilderMod, Added as BuilderAdded, Check as BuilderCheck,
  VersionField as BuilderVersion, Output as BuilderFile, Log as BuilderLog, BuildResult as BuilderResult,
} from '../../../vendor/elekloader/kit/src/kit/protocol.ts'
export type BuilderMachine = 'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii'

// Digitakt/Digitone mk1 downloads retain their owner-approved parity gate. Digitakt II (OS 1.17) and Analog Rytm MKII (OS 1.74) are separate
// research previews: their builder is wired for local checks, but downloads remain disabled pending qualification/review.
export const DIGI_DOWNLOADS_ENABLED: Readonly<Record<BuilderMachine, boolean>> = {
  digitakt: true,
  'digitakt-ii': false,
  digitone: true,
  'analog-rytm-mkii': false,
}

export function digiDownloadsEnabled(machine: string): boolean {
  return Object.hasOwn(DIGI_DOWNLOADS_ENABLED, machine) && DIGI_DOWNLOADS_ENABLED[machine as BuilderMachine] === true
}

// Research machines whose page offers a local core build before any module is published. Build outcomes count
// by machine; download availability remains governed independently above.
export const CORE_BUILD_PREVIEWS: readonly BuilderMachine[] = ['digitakt-ii']
export function isCoreBuildPreview(machine: string): boolean { return (CORE_BUILD_PREVIEWS as readonly string[]).includes(machine) }
