// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { Session } from './api'
import { USB_LINK } from '../engine/protocol'
import { OCTATRACK_BASE_RELEASED } from '../config/octatrack-base'
/** Access follows the server session, never a username or locally stored preference. */
export function hasBetaAccess(session: Session) {
  return !!(session.user?.verified && session.user.username && (session.user.betaTester || session.admin))
}
/** What is still in the beta beyond the Octatrack base path, such as another machine's beta-only pages (the Zoom
 * pedals'): beta testers, verified administrators and every dev build (`released`). It follows the session, so revoking
 * beta access turns it off. */
export function hasBetaUi(session: Session, released = USB_LINK) {
  return released || hasBetaAccess(session)
}
/** The Octatrack base path's interface: module sets, the Your Octatrack hub, the USB link with its sync dialog and the
 * base install. Beta testers, verified administrators and every dev build, and everyone once OCTATRACK_BASE_RELEASED
 * (`released`) is on; everyone else sees main's. It follows the session, so revoking beta access turns it off. */
export function hasOctatrackBase(session: Session, released = OCTATRACK_BASE_RELEASED || USB_LINK) {
  return released || hasBetaAccess(session)
}
/** The Octatrack USB link, its status, the update flow and the base install prompt: the Octatrack base path on a computer. */
export function hasUsbLinkAccess(session: Session, touchOnly: boolean, released = OCTATRACK_BASE_RELEASED || USB_LINK) {
  return !touchOnly && hasOctatrackBase(session, released)
}
