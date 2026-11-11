// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/** The one release switch for the Octatrack base path: the Modwerk base, the Your Octatrack hub, the USB link and its
 * sync dialog, module sets and the guided base install with its prompt (`hasOctatrackBase` in
 * src/community/beta-access.ts, `memberOctatrackBase` in server/beta-testers.ts). Off, they stay with beta testers,
 * verified administrators and dev builds. On releases them to everyone on the site; the base install prompt, which needs
 * an account, reaches every verified member. Beta modules, the beta-only Zoom pedal pages and the tester flag stay on the
 * beta gate (`hasBetaAccess`, `hasBetaUi`) either way. */
export const OCTATRACK_BASE_RELEASED = true
