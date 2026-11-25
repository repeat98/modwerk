// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const SUPPORT_URL = 'https://ko-fi.com/jannikassfalg'

/** Running costs shown in the support dialogs, whole euros, updated by hand: `monthly` for hosting and the AI tokens
 * Modwerk is built with (0 hides them), optionally split into `hosting` and `tokens`. Set `month` and `covered` (what Ko-fi
 * tips brought in that month) to add a bar; leave them out while the amount is unknown. */
export type SupportCosts = { monthly: number; hosting?: number; tokens?: number; month?: string; covered?: number }
export const SUPPORT_COSTS: SupportCosts = { monthly: 145 }
