// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { useSyncExternalStore } from 'react'
import { diagnosticPreference, subscribeDiagnosticPreference, type DiagnosticPreference } from './octatrack-diagnostics'
import { DIAGNOSTIC_INVITATION_PLACEMENTS, OCTATRACK_DIAGNOSTICS_VERSION } from './octatrack-diagnostics-contract'
import { browserRequestsPrivacy } from './usage'

/** Whether the install guide has a diagnostics step to show: a signed-in member who doesn't share under the current
 * consent version, where sharing is possible. While the choice is still being read, it is shown. */
export const diagnosticsStepNeeded = (state: DiagnosticPreference, privacy = browserRequestsPrivacy()) =>
  !!state.accountId && !state.enabled && (!state.ready || state.available) && !privacy
export function useDiagnosticsStepNeeded() {
  return diagnosticsStepNeeded(useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference))
}

const invitationKey = (memberId: string) => `modwerk.diagnostics.invitation:${OCTATRACK_DIAGNOSTICS_VERSION}:${memberId}`
/** Whether this member answered the invitation under the current consent version in this browser (Not now or closed,
 * anywhere it is asked: the first connection, the install guide, the beta note), so it isn't asked again by itself. */
export function invitationAnswered(memberId: string) { try { return localStorage.getItem(invitationKey(memberId)) === 'dismissed' } catch { return false } }
export function rememberInvitationAnswer(memberId: string) { try { localStorage.setItem(invitationKey(memberId), 'dismissed') } catch { /* still answered for this visit */ } }

export type StepRow = {day:string;event:string;detail:string;count:number}
/** The last 30 days of the base install guide's steps and the invitation's answers, summed over the days. */
export function stepTotals(rows: StepRow[]) {
  const total = (event: string, detail?: string) => rows.filter(row => row.event === event && (detail === undefined || row.detail === detail)).reduce((sum, row) => sum + row.count, 0)
  const failures = [...new Set(rows.filter(row => row.event === 'base_install_failed').map(row => row.detail))].sort().map(detail => ({detail, count: total('base_install_failed', detail)}))
  const invitations = DIAGNOSTIC_INVITATION_PLACEMENTS.map(placement => {
    const shown = total('diagnostics_invite_shown', placement), shared = total('diagnostics_invite_shared', placement)
    return {placement, shown, shared, notNow: total('diagnostics_invite_not_now', placement), rate: shown ? Math.round(shared / shown * 100) : null}
  })
  return {funnel: (['base_guide_opened','base_file_downloaded','base_first_connection','base_usb_update_done'] as const).map(event => ({event, count: total(event)})), failures, invitations}
}
