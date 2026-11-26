// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const USAGE_EVENTS = ['page_view', 'configuration_started', 'build_succeeded', 'build_failed', 'firmware_download_requested', 'configuration_exported', 'support_opened', 'support_link_opened', 'discord_member_prompt_shown', 'discord_member_join_clicked', 'discord_member_dismissed', 'discord_visitor_prompt_shown', 'discord_visitor_signup_clicked', 'discord_visitor_join_clicked', 'discord_visitor_dismissed', 'discord_welcome_join_clicked'] as const
export type UsageEvent = typeof USAGE_EVENTS[number]
/** What a public announcement card counts, for every viewer; each report names one public announcement and nothing else. */
export const ANNOUNCEMENT_COUNTS = { announcement_shown: 'shown', announcement_opened: 'opened', announcement_dismissed: 'dismissed' } as const
export type AnnouncementCountEvent = keyof typeof ANNOUNCEMENT_COUNTS
/** Machines that build firmware here. Builds, failed builds and download requests may name one; nothing else does. */
export const USAGE_DEVICES = ['octatrack', 'digitakt', 'digitone', 'digitakt-ii', 'analog-rytm-mkii', 'model-cycles'] as const
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
export const OCTATRACK_INSTALL_EVENTS = ['base_first_connection', 'base_usb_update_done', 'usb_sync_kept'] as const
export type OctatrackInstallEvent = typeof OCTATRACK_INSTALL_EVENTS[number]
export type InstallActivity = {
  guideFrom: string | null
  syncFrom: string | null
  counts: { day: string; event: OctatrackInstallEvent; count: number }[]
}
export type UsageStatistics = { generatedAt: string; collectionStarted: string | null; from: string; to: string; days: number; rows: UsageDay[]; comparison?: UsageComparison
  installActivity?: InstallActivity
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
  pages?: UsagePageDay[]
  /** The period's visit sources and sign-in prompt answers; absent from a backend before migration 0097. */
  siteCounts?: SiteCountTotal[]
  siteCountsStarted?: string | null }
/** Where a page load came from: one fixed category from the link's `utm_source` or the referring site's domain
 * (visit-source.ts). The address itself never leaves the browser. */
export const VISIT_SOURCES = ['direct', 'google', 'bing', 'duckduckgo', 'brave', 'ecosia', 'other-search', 'chatgpt', 'claude', 'perplexity', 'gemini', 'copilot', 'reddit', 'youtube', 'instagram', 'facebook', 'x', 'discord', 'discord-bot', 'github', 'github-readme', 'elektronauts', 'gearnews', 'synthtopia', 'cdm', 'musicradar', 'synthanatomy', 'bonedo', 'push', 'forum-feed', 'forum-share', 'mail', 'mail-news', 'mail-activity', 'mail-welcome', 'mail-beta', 'other'] as const
export type VisitSource = typeof VISIT_SOURCES[number]
/** How the sign-in prompt was answered: `gate-…` before a firmware build (it can be skipped), `other-…` before a
 * member action such as a like, a follow or a reply. */
export const SIGN_IN_PROMPT_OUTCOMES = ['gate-shown', 'gate-sign-in', 'gate-create-account', 'gate-skipped', 'gate-closed', 'other-shown', 'other-sign-in', 'other-create-account', 'other-closed'] as const
export type SignInPromptOutcome = typeof SIGN_IN_PROMPT_OUTCOMES[number]
/** Identifier-free daily totals in site_count_daily, each with exactly one category from its list. */
/** The support thank-you by what earned it (installs, days of use, a base install) and how it was answered (Escape or
 * the close gesture counts as `closed`), and every other Ko-fi click by where it happened. */
export const SUPPORT_PROMPT_COUNTS = ['installs-shown', 'installs-kofi', 'installs-later', 'installs-closed', 'installs-never', 'days-shown', 'days-kofi', 'days-later', 'days-closed', 'days-never', 'base-shown', 'base-kofi', 'base-later', 'base-closed', 'base-never', 'line-kofi', 'dialog-kofi', 'bell-kofi', 'announcement-kofi', 'welcome-kofi'] as const
export type SupportPromptCount = typeof SUPPORT_PROMPT_COUNTS[number]
export const SITE_COUNTS = { visit_source: VISIT_SOURCES, sign_in_prompt: SIGN_IN_PROMPT_OUTCOMES, support_prompt: SUPPORT_PROMPT_COUNTS } as const satisfies Record<string, readonly string[]>
export type SiteCount = keyof typeof SITE_COUNTS
export type SiteCountTotal = { event: SiteCount; detail: string; count: number }
