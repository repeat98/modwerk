// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/** When to thank someone who uses Modwerk a lot. Everything here stays in this browser and is never sent: how many
 * installs and days of use it has seen, which thank-you waits for the next visit, when one was last shown, and whether
 * the visitor opened Ko-fi or asked not to be asked again. */
const key = 'modwerk.support.prompt'
/** At most one thank-you in this time, whatever earned it. */
export const SUPPORT_PROMPT_COOLDOWN = 60 * 86400000

export const SUPPORT_PROMPT_KINDS = ['installs', 'days', 'base'] as const
export type SupportPromptKind = typeof SUPPORT_PROMPT_KINDS[number]
export type SupportPromptReason = { kind: SupportPromptKind; count: number }
export type SupportPromptState = { installs: number; days: number; lastDay?: string; shownAt?: number; pending?: SupportPromptReason; pendingAt?: number; done?: 'kofi' | 'never' }
export type SupportPromptAnswer = 'later' | 'kofi' | 'never'
type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The 5th, the 25th, the 100th and every further 100th install. */
export function isInstallMilestone(count: number) { return count === 5 || count === 25 || count >= 100 && count % 100 === 0 }
/** The 10th and the 30th day this browser used Modwerk. */
export function isDayMilestone(count: number) { return count === 10 || count === 30 }

function browserStore(): Store | null { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
const whole = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0

export function readSupportPrompt(storage: Store | null = browserStore()): SupportPromptState {
  const empty = { installs: 0, days: 0 }
  try {
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? 'null')
    if (!saved || typeof saved !== 'object') return empty
    const value = saved as Record<string, unknown>, state: SupportPromptState = { installs: whole(value.installs), days: whole(value.days) }
    if (typeof value.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastDay)) state.lastDay = value.lastDay
    if (whole(value.shownAt)) state.shownAt = whole(value.shownAt)
    const pending = value.pending as Record<string, unknown> | null | undefined
    if (pending && typeof pending === 'object' && (SUPPORT_PROMPT_KINDS as readonly unknown[]).includes(pending.kind) && whole(pending.count) && whole(value.pendingAt)) {
      state.pending = { kind: pending.kind as SupportPromptKind, count: whole(pending.count) }; state.pendingAt = whole(value.pendingAt)
    }
    if (value.done === 'kofi' || value.done === 'never') state.done = value.done
    return state
  } catch { return empty }
}
function write(state: SupportPromptState, storage: Store | null) { try { storage?.setItem(key, JSON.stringify(state)) } catch { /* the note is optional */ } }
const cooling = (state: SupportPromptState, now: number) => !!state.shownAt && now - state.shownAt < SUPPORT_PROMPT_COOLDOWN

/** Saves what was counted and, when it earns a thank-you outside the cooldown, keeps it for a later visit, so the note
 * never interrupts the moment that earned it. A newer reason replaces one still waiting. */
function earn(storage: Store | null, now: number, change: (state: SupportPromptState) => SupportPromptState | null, reason: (state: SupportPromptState) => SupportPromptReason | null) {
  if (!storage) return
  const next = change(readSupportPrompt(storage))
  if (!next) return
  const earned = reason(next)
  write(earned && !next.done && !cooling(next, now) ? { ...next, pending: earned, pendingAt: now } : next, storage)
}

/** Call once per completed install: a kept USB sync, a saved card file or a downloaded firmware file. */
export function noteSupportInstall(storage: Store | null = browserStore(), now = Date.now()) {
  earn(storage, now, state => ({ ...state, installs: state.installs + 1 }), state => isInstallMilestone(state.installs) ? { kind: 'installs', count: state.installs } : null)
}
/** Call once per page load: counts the day, the first time this browser uses Modwerk on it. */
export function noteSupportVisit(storage: Store | null = browserStore(), now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10)
  earn(storage, now, state => state.lastDay === today ? null : { ...state, days: state.days + 1, lastDay: today }, state => isDayMilestone(state.days) ? { kind: 'days', count: state.days } : null)
}
/** Call when the Modwerk base first connects after an install, or a USB base update completes. */
export function noteSupportBase(storage: Store | null = browserStore(), now = Date.now()) {
  earn(storage, now, state => state, () => ({ kind: 'base', count: 1 }))
}

/** The thank-you to show on a page loaded at `pageLoadedAt`, or null. */
export function dueSupportPrompt(pageLoadedAt: number, storage: Store | null = browserStore(), now = Date.now()): SupportPromptReason | null {
  const state = readSupportPrompt(storage)
  return !state.done && state.pending && state.pendingAt! < pageLoadedAt && !cooling(state, now) ? state.pending : null
}

/** `later` clears a waiting note and starts the cooldown (also called when one is shown, so a closed tab does not bring it
 * back); `kofi` and `never` end the notes for good. Any Ko-fi click on the site counts as `kofi`. */
export function answerSupportPrompt(answer: SupportPromptAnswer, storage: Store | null = browserStore(), now = Date.now()) {
  const state = readSupportPrompt(storage)
  delete state.pending; delete state.pendingAt
  write(answer === 'later' ? { ...state, shownAt: now } : { ...state, done: answer }, storage)
}
