// SPDX-License-Identifier: GPL-3.0-or-later
// The USB link's recent events, kept in this page's memory whether or not the member shares diagnostics (owner,
// 24 November 2026). Nothing here is ever sent by itself: the events leave the computer only when the member copies
// them, saves them or attaches them to a problem report they post (support-report.ts). They are the same records the
// shared diagnostics carry (octatrack-diagnostics-contract.ts): numbers, codes and hashes, no names. A reload empties it.
import type { LinkDiagnostic, LinkState } from './octatrack-link.ts'
import { baseVersion, runningLayout } from './base-variants.ts'
import { diagnosticClient } from '../../community/diagnostic-client'
import type { SupportAttachment, SupportUnit } from '../../community/support-report'

/** How many events the trail holds: a failed sync, install or base update and the connections around it. */
export const TRAIL_EVENTS = 100

export interface TrailEntry { readonly at: number; readonly event: LinkDiagnostic }

export class LinkTrail {
  private entries: TrailEntry[] = []
  private error?: { text: string; at: number }
  private readonly size: number
  private readonly now: () => number
  constructor(size = TRAIL_EVENTS, now: () => number = Date.now) { this.size = size; this.now = now }
  record(event: LinkDiagnostic) {
    this.entries.push({ at: this.now(), event: structuredClone(event) })
    if (this.entries.length > this.size) this.entries.splice(0, this.entries.length - this.size)
  }
  /** The newest `count` events, oldest first. */
  recent(count = this.size): TrailEntry[] { return count > 0 ? this.entries.slice(-count) : [] }
  get length() { return this.entries.length }
  /** The last error the page showed about the link, in the words it showed (the link's notices and the errors the
   * dialogs display). Only Report a problem reads it, to prefill a field the member edits; it is never attached. */
  noteError(text: string) { if (text && text !== this.error?.text) this.error = { text, at: this.now() } }
  get lastError() { return this.error }
}

/** IDENTIFY's model text, when it is plain enough to quote ("OCTATRACK 1.40C"). */
const MODEL = /^[A-Za-z0-9 ._+-]{1,16}$/
/** The unit and the newest `count` events, as support-report.ts writes them. While the unit is away (after a failed
 * update, say), the base and set are the last ones an event named. */
export function linkAttachment(state: LinkState, trail: LinkTrail, count?: number): SupportAttachment {
  const entries = trail.recent(count), last = [...entries].reverse().find(entry => entry.event.base)?.event
  const base = state.identity?.base ?? last?.base, active = state.identity ? state.active ?? undefined : last?.active
  const version = base ? baseVersion(base) : undefined, layout = base ? runningLayout(base) : undefined, model = state.identity?.model
  const unit: SupportUnit | undefined = base ? { base, ...(version ? { version } : {}), ...(layout ? { layout } : {}), ...(model && MODEL.test(model) ? { model } : {}), ...(active ? { active } : {}) } : undefined
  // A failure before the link existed carries its reason alone, as the shared record does (octatrack-diagnostics.ts).
  const shape = (event: LinkDiagnostic): LinkDiagnostic => event.event === 'link_failed' ? { event: event.event, phase: event.phase, failure: event.failure } : event
  return { schema: 1, ...(unit ? { unit } : {}), client: diagnosticClient(), events: entries.map(({ at, event }) => ({ at: new Date(at).toISOString(), ...shape(event) })) }
}
