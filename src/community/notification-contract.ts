// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export type NotificationKind = 'reply' | 'mention' | 'bug_report' | 'post_like' | 'module_comment' | 'module_rating' | 'module_like' | 'module_update' | 'message' | 'request_status' | GithubIssueKind
/** Replies and status changes on one of the recipient's own reports, locally or on GitHub. */
export type GithubIssueKind = 'issue_comment' | 'issue_resolved' | 'issue_closed' | 'issue_reopened'
/** One bell entry. For `request_status` the excerpt is the request's new status.
 * Content fields come from public posts, comments and GitHub issues; the entry itself is private to its recipient.
 * `github_actor` and `url` are the GitHub login and issue link for GitHub activity. `post_page` is the thread page that holds `post_id`.
 * `issueReporter` is false when a report's maintainer, not its reporter, receives the entry. */
export type NotificationItem = { id: string; kind: NotificationKind; seen: boolean; created_at: string; thread_id: string | null; post_id: string | null; post_page?: number | null; module_id: string | null; module_version?: string | null; actor: string | null; actorOfficial: boolean; actorAvatar?: string | null; title: string | null; excerpt: string | null; rating: number | null; issue_id: string | null; issue_scope?: 'module' | 'configuration' | null; issueReporter?: boolean; github_actor: string | null; url: string | null }
export type AnnouncementVisibility = 'public' | 'signed-in'
/** Shared display contract. The bell lists private activity and signed-in announcements; public announcements have a separate floating card. Announcements are never mailed. */
export type BellItem = Omit<NotificationItem, 'kind'> & { kind: NotificationKind | 'announcement' }
export type NotificationPreferences = { emailEnabled: boolean; frequency: 'hours' | 'daily'; replies: boolean; likes: boolean; modules: boolean; bugs: boolean; updates: boolean; messages: boolean; emailAvailable: boolean }
/** Which email setting covers each kind. Module likes count as module activity; likes on posts have their own switch. */
export const EMAIL_SETTING: Record<NotificationKind, 'replies' | 'likes' | 'modules' | 'bugs' | 'updates' | 'messages'> = { reply: 'replies', mention: 'replies', post_like: 'likes', module_comment: 'modules', module_rating: 'modules', module_like: 'modules', bug_report: 'bugs', issue_comment: 'bugs', issue_resolved: 'bugs', issue_closed: 'bugs', issue_reopened: 'bugs', module_update: 'updates', message: 'messages', request_status: 'replies' }
/** Digest spacing per frequency; the hourly job sends when the member's last digest is older than this. */
export const DIGEST_HOURS = { hours: 6, daily: 24 } as const
