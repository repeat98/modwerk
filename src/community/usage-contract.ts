// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const USAGE_EVENTS = ['page_view', 'configuration_started', 'build_succeeded', 'build_failed', 'firmware_download_requested', 'configuration_exported', 'support_opened', 'support_link_opened', 'discord_member_prompt_shown', 'discord_member_join_clicked', 'discord_member_dismissed', 'discord_visitor_prompt_shown', 'discord_visitor_signup_clicked', 'discord_visitor_join_clicked', 'discord_visitor_dismissed', 'discord_welcome_join_clicked'] as const
export type UsageEvent = typeof USAGE_EVENTS[number]
/** What a public announcement card counts, for every viewer; each report names one public announcement and nothing else. */
export const ANNOUNCEMENT_COUNTS = { announcement_shown: 'shown', announcement_opened: 'opened', announcement_dismissed: 'dismissed' } as const
export type AnnouncementCountEvent = keyof typeof ANNOUNCEMENT_COUNTS
/** Machines that build firmware here. Builds, failed builds and download requests may name one; nothing else does. */
export const USAGE_DEVICES = ['octatrack', 'digitakt', 'digitone', 'digitakt-ii', 'analog-rytm-mkii'] as const
export type UsageDevice = typeof USAGE_DEVICES[number]
export const DEVICE_EVENTS: readonly UsageEvent[] = ['build_succeeded', 'build_failed', 'firmware_download_requested']
export type DiscordInviteCounts = { discord_member_shown: number; discord_member_joins: number; discord_member_dismissals: number; discord_visitor_shown: number; discord_visitor_signups: number; discord_visitor_joins: number; discord_visitor_dismissals: number; discord_welcome_joins: number }
export type UsageDay = { day: string; visitors: number; page_views: number; configurations: number; builds: number; builds_failed: number; downloads: number; exports: number; support_opens: number; support_clicks: number } & Partial<DiscordInviteCounts>
/** One UTC hour ('YYYY-MM-DDTHH') of the same totals. Visitors are daily visitors counted in the hour of their first event that day. */
export type UsageHour = Omit<UsageDay, 'day'> & { hour: string }
/** Period totals for one machine, from the day the breakdowns began. */
export type UsageDeviceTotals = { device: UsageDevice; builds: number; builds_failed: number; downloads: number }
export type UsageComparison = { from: string; to: string; rows: UsageDay[]; unavailableReason: 'collection' | 'retention' | null }
/** Counts per named page and UTC day, without visitor identifiers. */
export type UsagePageDay = { day: string; page: string; views: number }
export type UsageStatistics = { generatedAt: string; collectionStarted: string | null; from: string; to: string; days: number; rows: UsageDay[]; comparison?: UsageComparison
  /** When failed builds and the machine split began to be counted; earlier days have neither. */
  breakdownsStarted?: string | null
  /** Migration boundary for Digitakt II and Analog Rytm MKII attribution; earlier events stay unattributed. */
  machineCoverageExpanded?: string | null
  /** When support dialog opens, Ko-fi clicks and hourly totals began to be counted; earlier days have none. */
  hourlyStarted?: string | null
  /** Beginning of invitation counts; clicks measure the chosen action. */
  discordInvitesStarted?: string | null
  /** The period's hours, only for the 7-day view; hourly totals are kept for 14 days. */
  hourly?: UsageHour[]
  devices?: UsageDeviceTotals[]
  /** Optional for compatibility with a backend deployed before page-level counts. */
  pagesStarted?: string | null
  pages?: UsagePageDay[] }
