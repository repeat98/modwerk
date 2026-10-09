// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { isModuleAvailable } from '../catalog/availability'
import { moduleBuildPending } from '../catalog/build-support'
import { communityModule } from './modules'

/** Download events use the same machine-specific IDs as ratings and likes. */
export function canTrackModuleDownload(id: string, betaAccess = false) {
  const module = communityModule(id)
  return !!module && (module.machine !== 'octatrack' || isModuleAvailable(id, betaAccess) && !moduleBuildPending(id))
}
