// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { MemberRole } from './member-standing'
import { machineModules } from './modules'
import { compareModuleVersions } from '../catalog/versions'
import { parseUsbAudioConfiguration, USB_AUDIO_MODULE, type UsbAudioConfiguration } from '../config/usb-audio'
import { DEVICES_BY_ID } from '../devices/registry'
import type { ProfileLinks } from './profile-links'
export const FORUM_CATEGORIES = { general: 'General discussion', introductions: 'Introductions', showcase: 'Showcase', requests: 'Feature requests', tutorials: 'Tutorials & guides', modules: 'Module help', configs: 'Shared configurations', issues: 'Bug reports' } as const
export const FORUM_CATEGORY_DESCRIPTIONS: Record<keyof typeof FORUM_CATEGORIES, string> = {
  general: 'Talk gear, workflows, and everything Modwerk.',
  introductions: 'Say hello and meet the people behind the patches.',
  showcase: 'Share your music, live sets, and hardware projects.',
  requests: 'Suggest a mod or explore an idea together.',
  tutorials: 'Share what you learned, from first flash to building mods.',
  modules: 'Ask questions and exchange tips with module developers.',
  configs: 'Share module combinations others can try.',
  issues: 'Browse reported bugs. Report new issues from the affected module’s page.',
}
export type ForumCategorySummary = { category: keyof typeof FORUM_CATEGORIES; threads: number; replies: number }
export type ForumShout = { id: string; body: string; username: string | null; avatar?: string | null; created_at: string; edited_at: string | null; hidden: number; canEdit: boolean }
export type ForumShouts = { messages: ForumShout[]; hasMore: boolean }
export const SHOUT_MAX_LENGTH = 600
export type ForumCategory = keyof typeof FORUM_CATEGORIES
/** Where a feature request stands. Administrators and the linked maintainers of its module set it; every other topic keeps 'open'. */
export const REQUEST_STATUSES = { open: 'Open', planned: 'Planned', shipped: 'Shipped', declined: 'Declined' } as const
export type RequestStatus = keyof typeof REQUEST_STATUSES
// A thread may name one Elektron machine; null means it is about Modwerk or every machine.
export function forumMachine(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !DEVICES_BY_ID[value]) throw new Error('Choose a machine from the list.')
  return value
}
export type ForumMachineSummary = { machine: string; threads: number; updated_at: string }
export type SharedConfiguration = { name: string; device?: string; moduleIds: string[]; moduleVersions: Record<string,string>; keepStockFx2: boolean; usbAudio?: UsbAudioConfiguration }
export function sharedConfiguration(value: unknown): SharedConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a configuration to share.')
  const item = value as SharedConfiguration
  if (Object.keys(item).some(key => !['name','device','moduleIds','moduleVersions','keepStockFx2','usbAudio'].includes(key))) throw new Error('Only configuration names, machine, module choices, versions and settings can be shared. Firmware and other files are not accepted.')
  const device = item.device ?? 'octatrack'
  if (item.device !== undefined && typeof item.device !== 'string') throw new Error('Choose a valid configuration machine.')
  if (typeof device !== 'string' || !['octatrack','digitakt','digitone'].includes(device)) throw new Error('Choose a machine with configurable modules.')
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || typeof item.keepStockFx2 !== 'boolean' || !Array.isArray(item.moduleIds) || !item.moduleIds.length || item.moduleIds.length > 100 || new Set(item.moduleIds).size !== item.moduleIds.length || item.moduleIds.some(id => typeof id !== 'string' || !machineModules(device).some(module => module.moduleId === id))) throw new Error('This configuration has invalid module choices or settings.')
  if (!item.moduleVersions || typeof item.moduleVersions !== 'object' || Array.isArray(item.moduleVersions) || Object.keys(item.moduleVersions).length !== item.moduleIds.length || Object.keys(item.moduleVersions).some(id => !item.moduleIds.includes(id))) throw new Error('Include the exact version of every module.')
  for (const id of item.moduleIds) {
    const version = item.moduleVersions[id]
    if (typeof version !== 'string' || version.length > 80) throw new Error('Include the exact version of every module.')
    compareModuleVersions(version, version)
  }
  if (item.usbAudio !== undefined && (device !== 'octatrack' || !item.moduleIds.includes(USB_AUDIO_MODULE))) throw new Error('USB Audio settings require the Octatrack USB Audio module.')
  const usbAudio = item.usbAudio === undefined ? undefined : parseUsbAudioConfiguration(item.usbAudio)
  return { name: item.name.trim(), ...(item.device ? {device} : {}), moduleIds: [...item.moduleIds], moduleVersions: { ...item.moduleVersions }, keepStockFx2: item.keepStockFx2, ...(usbAudio ? { usbAudio } : {}) }
}
export type ForumThread = { worksReports?:number;id:string;title:string;category:ForumCategory;machine:string|null;module_id:string|null;username:string|null;avatar?:string|null;official?:number;status:'open'|'resolved';request_status:RequestStatus;votes:number;locked:number;pinned:number;hidden?:number;created_at:string;updated_at:string;replies:number;last_post_id?:string|null;last_username?:string|null;last_excerpt?:string|null;last_post_page?:number;media_kinds?:string|null;unread?:number;new_replies?:number }
/** What happened since a member's previous forum visit; `since` is null on the first visit. */
export type ForumVisit = { since: string | null; newThreads: number; newReplies: number; unreadFollowed: number }
// Images and sound clips attached to a post. Sizes are checked again on the server after the file type is read from its bytes.
/** An @username as the Worker notifies it: not inside a word, an email or a path, 3–24 username characters. */
export const MENTION_SOURCE = String.raw`(?<![\w@/])@([A-Za-z0-9_]{3,24})(?![A-Za-z0-9_])`
export type MentionPart = { type: 'text' | 'mention'; value: string }
/** Splits text into plain runs and mentions; a mention's value is the username without the @. */
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = []
  let last = 0
  for (const match of text.matchAll(new RegExp(MENTION_SOURCE, 'g'))) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'mention', value: match[1] })
    last = match.index + match[0].length
  }
  if (last < text.length || !parts.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}
/** The @name being typed right before the caret, if any: where it starts and the letters so far. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[\s(>"'“[])@([A-Za-z0-9_]{0,24})$/.exec(text.slice(0, caret))
  return match ? { start: caret - match[1].length - 1, query: match[1] } : null
}
/** Direct messages are plain text. */
export const MESSAGE_MAX_LENGTH = 4000
export const FORUM_MEDIA = { maxImageBytes: 5 * 1024 * 1024, maxAudioBytes: 10 * 1024 * 1024, perPost: 4, captionLength: 300, dailyFiles: 20, dailyBytes: 100 * 1024 * 1024 } as const
export type ForumAttachment = {id:string;kind:'image'|'audio';caption:string}
/** A recent post with images or sound clips, for the Showcase strip. `page` is the thread page that holds it. */
export type ForumShowcaseItem = {id:string;thread_id:string;created_at:string;username:string|null;avatar?:string|null;official:number;title:string;category:ForumCategory;machine:string|null;page:number;attachments:ForumAttachment[]}
/** `maintainer` marks a post by a linked maintainer of the thread's module: a claim confirmed by the reviewed catalog and a GitHub sign-in, never the manifest alone. */
export type ForumPost = {id:string;body:string;username:string|null;avatar?:string|null;displayName?:string|null;user_id?:string;created_at:string;edited_at:string|null;hidden:number;likes:number;liked:boolean;canEdit:boolean;canRemoveMedia?:boolean;official?:boolean;maintainer?:boolean;role?:MemberRole|null;betaTester?:boolean;attachments:ForumAttachment[]}
/** A reply as a profile or highlight lists it; `page` is the thread page that holds it. */
export type ForumReplyItem = {id:string;thread_id:string;title:string;excerpt:string;created_at:string;page:number}
export type MemberProfile = {username:string;displayName:string;bio:string;avatar:string|null;memberSince:string;role:MemberRole;betaTester?:boolean;threads:number;replies:number;likesReceived:number;reports:number;maintains:{id:string;name:string;machine:string;href:string}[];recentReplies:ForumReplyItem[]} & ProfileLinks
export type ForumMember = {username:string;avatar:string|null}
export type ForumHighlights = {since:string;topPosts:(ForumReplyItem&ForumMember&{category:ForumCategory;likes:number})[];topMembers:(ForumMember&{likes:number})[];newMembers:ForumMember[]}
/** The public online count, and the names of members who show themselves in the online list; `more` are online but unlisted. */
export type MembersOnline = {online:number;members:ForumMember[];more:number}
export type ThreadDetail = {thread:ForumThread;posts:ForumPost[];configuration:SharedConfiguration|null;issue:{device:string;version:string;steps:string;expected:string;actual:string}|null;following:boolean;bookmarked:boolean;voted:boolean;canSetRequestStatus:boolean;hasMore:boolean;firstUnread?:{id:string;page:number}|null}
