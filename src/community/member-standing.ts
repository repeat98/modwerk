// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/** Roles shown on profiles and posts. Members are 'user' unless an administrator or a confirmed module claim makes
 * them a developer; the owner is set only by migration. */
export const MEMBER_ROLES = ['user', 'developer', 'owner'] as const
export type MemberRole = typeof MEMBER_ROLES[number]
export const CONTRIBUTION_LABELS = { contributor: 'Contributor', modder: 'Modder', 'device-reviewer': 'Device reviewer', maintainer: 'Maintainer' } as const
export type ContributionRoles = { roles: (keyof typeof CONTRIBUTION_LABELS)[]; reviewDevices: string[] }
export const ROLE_LABELS: Record<MemberRole, string> = { user: 'Member', developer: 'Modder', owner: 'Owner' }

/** Keep previously granted or verified modder badges when showing repository roles. */
export function publicContributions(badges: ContributionRoles | undefined, role: MemberRole | undefined) {
  if (!badges || role !== 'developer' || badges.roles.includes('modder')) return badges
  return { ...badges, roles: ['modder' as const, ...badges.roles.filter(kind => kind !== 'contributor')] }
}
export const isMemberRole = (value: unknown): value is MemberRole => MEMBER_ROLES.includes(value as MemberRole)
/** The role a member shows: the stored role, raised to developer by a confirmed module claim. */
export const effectiveRole = (stored: string, developer: boolean): MemberRole => stored === 'owner' ? 'owner' : stored === 'developer' || developer ? 'developer' : 'user'

/** Points per contribution. Hidden posts and threads, likes on one's own posts and suspended members never count,
 * so removing content also removes its points. */
export const POINTS = { thread: 5, reply: 2, like: 1, report: 3, module: 50 } as const
export type Contributions = { threads: number; replies: number; likesReceived: number; reports: number; modules: number }

/** Ranked tiers, lowest first. Each starts at its point threshold. */
export const TIERS = [
  { id: 'listener', name: 'New member', from: 0 },
  { id: 'jammer', name: 'Member', from: 25 },
  { id: 'performer', name: 'Contributor', from: 100 },
  { id: 'producer', name: 'Regular contributor', from: 300 },
  { id: 'headliner', name: 'Established contributor', from: 1000 },
] as const
export type Tier = typeof TIERS[number]

export function contributionPoints(counts: Contributions) {
  return counts.threads * POINTS.thread + counts.replies * POINTS.reply + counts.likesReceived * POINTS.like + counts.reports * POINTS.report + counts.modules * POINTS.module
}

/** A member's points, tier and progress (0–1) towards the next tier; next is null at the top tier. */
export function memberStanding(counts: Contributions) {
  const points = contributionPoints(counts)
  const rank = TIERS.filter(tier => points >= tier.from).length - 1
  const tier = TIERS[rank], next = TIERS[rank + 1] ?? null
  const progress = next ? (points - tier.from) / (next.from - tier.from) : 1
  return { points, rank: rank + 1, tier, next, progress }
}
export type MemberStanding = ReturnType<typeof memberStanding>
