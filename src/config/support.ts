// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const SUPPORT_URL = 'https://ko-fi.com/jannikassfalg'

/** Running costs shown in the support dialogs, whole euros, updated by hand: `monthly` for hosting and the tokens
 * Modwerk is built with (0 hides them), optionally split into `hosting` and `tokens`. The Ko-fi bar reads the month's tips
 * from the webhook (server/kofi.ts); `month` ('YYYY-MM') and `covered` add tips it did not see, such as ones from before
 * it was set up, and alone show a bar while the webhook is not connected. */
export type SupportCosts = { monthly: number; hosting?: number; tokens?: number; month?: string; covered?: number }
export const SUPPORT_COSTS: SupportCosts = { monthly: 145 }
