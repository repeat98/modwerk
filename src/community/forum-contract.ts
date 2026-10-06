import { machineModules } from './modules'
import { compareModuleVersions } from '../catalog/versions'
import { DEVICES_BY_ID } from '../devices/registry'
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
// A thread may name one Elektron machine; null means it is about Modwerk or every machine.
export function forumMachine(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !DEVICES_BY_ID[value]) throw new Error('Choose a machine from the list.')
  return value
}
export type ForumMachineSummary = { machine: string; threads: number; updated_at: string }
export type SharedConfiguration = { name: string; device?: string; moduleIds: string[]; moduleVersions: Record<string,string>; keepStockFx2: boolean }
export function sharedConfiguration(value: unknown): SharedConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a configuration to share.')
  const item = value as SharedConfiguration
  if (Object.keys(item).some(key => !['name','device','moduleIds','moduleVersions','keepStockFx2'].includes(key))) throw new Error('Only configuration names, machine, module choices, versions and settings can be shared. Firmware and other files are not accepted.')
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
  return { name: item.name.trim(), ...(item.device ? {device} : {}), moduleIds: [...item.moduleIds], moduleVersions: { ...item.moduleVersions }, keepStockFx2: item.keepStockFx2 }
}
export type ForumThread = { id:string;title:string;category:ForumCategory;machine:string|null;module_id:string|null;username:string|null;avatar?:string|null;official?:number;status:'open'|'resolved';locked:number;pinned:number;hidden?:number;created_at:string;updated_at:string;replies:number;last_post_id?:string|null;last_username?:string|null;last_excerpt?:string|null;last_post_page?:number;media_kinds?:string|null }
// Images and sound clips attached to a post. Sizes are checked again on the server after the file type is read from its bytes.
export const FORUM_MEDIA = { maxImageBytes: 5 * 1024 * 1024, maxAudioBytes: 10 * 1024 * 1024, perPost: 4, captionLength: 300, dailyFiles: 20, dailyBytes: 100 * 1024 * 1024 } as const
export type ForumAttachment = {id:string;kind:'image'|'audio';caption:string}
/** A recent post with images or sound clips, for the Showcase strip. `page` is the thread page that holds it. */
export type ForumShowcaseItem = {id:string;thread_id:string;created_at:string;username:string|null;avatar?:string|null;official:number;title:string;category:ForumCategory;machine:string|null;page:number;attachments:ForumAttachment[]}
export type ForumPost = {id:string;body:string;username:string|null;avatar?:string|null;displayName?:string|null;user_id?:string;created_at:string;edited_at:string|null;hidden:number;likes:number;liked:boolean;canEdit:boolean;canRemoveMedia?:boolean;official?:boolean;attachments:ForumAttachment[]}
export type ThreadDetail = {thread:ForumThread;posts:ForumPost[];configuration:SharedConfiguration|null;issue:{device:string;version:string;steps:string;expected:string;actual:string}|null;following:boolean;bookmarked:boolean;hasMore:boolean}
