// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

/** Counts only: the Octatrack tab of the admin workspace never names a member or a visitor. */
export type AdminOctatrackCount = { key: string; count: number; people: number }
export type AdminOctatrackDay = {
  day: string
  /** Members whose unit first reported a Modwerk base on this UTC day. */
  installs: number
  /** Every visitor's USB sync actions (octatrack_beta_daily), sharing or not. */
  started: number
  kept: number
  undone: number
  failed: number
}
export type AdminOctatrack = {
  generatedAt: string
  from: string
  to: string
  installs: {
    /** Members whose unit has reported a Modwerk base, ever; visitors without an account are not counted. */
    total: number
    today: number
    last7: number
  }
  /** Consent that is on, current within 90 days, from verified unsuspended members, or from visitors. */
  sharing: {
    members: number
    /** Of `members`, those who agreed to the current consent text; the others' new reports wait for them to agree again. */
    membersCurrent: number
    /** Switched on within the last 7 days. */
    membersNew: number
    /** Members with at least one report kept in the last 30 days. */
    membersReporting: number
    guests: number
    guestsNew: number
    guestsReporting: number
  }
  /** Each sharer's (member or visitor) latest reported base identity, from reports in the last 30 days. */
  bases: { base: string; people: number; lastSeen: string }[]
  /** One row per UTC day from `from` to `to`. */
  daily: AdminOctatrackDay[]
  /** From shared reports in the last 30 days: occurrences, and how many sharers they came from. */
  health: {
    syncFailures: AdminOctatrackCount[]
    buildFailures: AdminOctatrackCount[]
    linkFailures: AdminOctatrackCount[]
    /** Browser and OS of the reports above that carry one, as `browser · os`. */
    linkClients: AdminOctatrackCount[]
    /** The unit's own log: incidents by kind, each counted once however often it was uploaded. */
    deviceIncidents: AdminOctatrackCount[]
    unresponsive: AdminOctatrackCount[]
  }
}
