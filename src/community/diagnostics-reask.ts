// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Asking a member who doesn't share diagnostics once more, right after a failure they would help explain. The
// question itself is DiagnosticsReask (DiagnosticsInvitation.tsx), shown by DiagnosticsInvitationGate.

/** What failed, each with the sentence the invitation opens with. */
export const REASK_REASONS = {
  'sync-failed': 'This sync failed. Sharing diagnostics would let us see why.',
  'selftest-failed': 'The self-test failed. Sharing diagnostics would let us see why.',
  'base-update-failed': 'The base update didn’t finish. Sharing diagnostics would let us see why.',
  recovery: 'Your Octatrack started its previous base because the newest one didn’t start. Sharing diagnostics would let us see why.',
  stall: 'Your Octatrack’s audio stopped. Sharing diagnostics would let us see why.',
} as const
export type ReaskReason = keyof typeof REASK_REASONS
/** After Not now on this question, it isn't asked again for this long (per member, in this browser). */
export const REASK_PAUSE_DAYS = 30

/** A question still waiting after this long is out of context and is dropped. */
export const REASK_STALE_MS = 10 * 60_000
export interface ReaskOffer { reason: ReaskReason; key: string; at: number }
let pending: ReaskOffer | undefined
const declined = new Set<string>()
const offered = new Set<string>(), listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

/** Ask once about this failure. `key` names it, so the same failure seen twice (a stall still showing, the same
 * failed self-test) asks once; without one each call is a failure of its own. One question waits at a time. Whether
 * it is shown at all (not sharing, no Not now on this page, not paused, nothing running, no other dialog) is the
 * gate's to decide when it can show it. Returns whether this failure now waits to be asked about. */
export function offerDiagnostics(reason: ReaskReason, key = reason + ':' + crypto.randomUUID()) {
  if (!Object.hasOwn(REASK_REASONS, reason) || offered.has(key) || pending) return false
  offered.add(key); pending = { reason, key, at: Date.now() }; notify()
  return true
}
/** The same, as a hook for components: `const { offer } = useDiagnosticsReask(); offer('sync-failed')`. */
export function useDiagnosticsReask() { return REASK }
const REASK = { offer: offerDiagnostics } as const
export const pendingReask = () => pending
export const subscribeReask = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
/** The waiting question was shown and answered, or can't be asked (sharing on, paused): it goes away. */
export function settleReask() { if (pending) { pending = undefined; notify() } }
/** Any Not now to a diagnostics invitation on this page: no further invitation for this member until the page reloads. */
export function declineForThisVisit(memberId: string | null) { if (memberId) declined.add(memberId); settleReask() }
export const declinedThisVisit = (memberId: string) => declined.has(memberId)

const pauseKey = (memberId: string) => 'modwerk.diagnostics.reask:' + memberId
/** Whether this member said Not now to this question within the last REASK_PAUSE_DAYS, in this browser. */
export function reaskPaused(memberId: string, now = Date.now()) {
  try { const at = Date.parse(localStorage.getItem(pauseKey(memberId)) ?? ''); return Number.isFinite(at) && now - at < REASK_PAUSE_DAYS * 86400000 && at <= now } catch { return false }
}
export function pauseReask(memberId: string, now = Date.now()) {
  try { localStorage.setItem(pauseKey(memberId), new Date(now).toISOString()) } catch { /* Paused for this visit only (declineForThisVisit). */ }
}
/** Tests only. */
export function resetReask() { pending = undefined; declined.clear(); offered.clear(); notify() }
