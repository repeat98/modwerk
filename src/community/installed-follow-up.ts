// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }
import { builtModules } from './build-follow-up'
import type { DownloadedBuild } from './hardware-feedback'

const published = packages as { packages: readonly { id: string; version: string }[] }
/** What a kept USB sync or a module file for the card put on an Octatrack, for the follow-ups a downloaded build gets
 * (useDownloadFollows: update notifications and the hardware feedback reminder): these modules at the versions their
 * base packages hold, which for a declared lag is older than the catalogue's. */
export function installedOnOctatrack(moduleIds: readonly string[]): DownloadedBuild {
  return { machine: 'Octatrack', os: '1.40C', modules: builtModules(moduleIds, Object.fromEntries(published.packages.map(entry => [entry.id, entry.version]))) }
}
