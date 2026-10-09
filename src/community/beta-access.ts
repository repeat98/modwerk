// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { Session } from './api'
/** Access follows the server session, never a username or locally stored preference. */
export function hasBetaAccess(session: Session) {
  return !!(session.user?.verified && session.user.username && (session.user.betaTester || session.admin))
}
