// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const SUPPORT_URL = 'https://ko-fi.com/jannikassfalg'

export type SupportCosts = { month: string; hosting: number; tokens: number; covered: number }
/** One month's running costs, shown in the support dialogs: whole euros for hosting and the AI tokens Modwerk is built
 * with, and what Ko-fi tips covered. Updated by hand; with `month` empty the costs are not shown. */
export const SUPPORT_COSTS: SupportCosts = { month: '', hosting: 0, tokens: 0, covered: 0 }
