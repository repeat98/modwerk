import { communityBase } from '../hosting'
import type { BuiltModule } from './build-follow-up'
import { communityModule } from './modules'

export type DownloadedBuild = { machine: string; os: string; modules: readonly BuiltModule[] }
export type HardwareFeedback = DownloadedBuild & { downloadedAt: number; remindAt: number; completed: string[]; dismissed: boolean; checkInAt?: number; checkInShownAt?: number }
export const CHECK_IN_DELAY = 5 * 60 * 1000
export const FEEDBACK_DELAY = 60 * 60 * 1000
export const FEEDBACK_SNOOZE = 24 * FEEDBACK_DELAY
export const FEEDBACK_RETENTION = 30 * FEEDBACK_SNOOZE
export const FEEDBACK_CHANGED = 'modwerk-hardware-feedback'
const key = (memberId: string) => 'modwerk.hardware-feedback:' + communityBase() + ':' + memberId
export const hardwareFeedbackLock = (memberId: string) => key(memberId) + ':check-in'
const text = (value: unknown, length: number): value is string => typeof value === 'string' && value.length <= length

/** Names and versions only, scoped to the signed-in member and API. Never firmware or a private configuration. */
export function feedbackId(build: DownloadedBuild) {
  return JSON.stringify([build.machine, build.os, build.modules.map(module => [module.id, module.version]).sort(([a], [b]) => a.localeCompare(b))])
}
function valid(value: unknown): value is HardwareFeedback {
  if (!value || typeof value !== 'object') return false
  const item = value as HardwareFeedback
  return text(item.machine, 80) && !!item.machine && text(item.os, 64)
    && Number.isSafeInteger(item.downloadedAt) && item.downloadedAt > 0 && Number.isSafeInteger(item.remindAt)
    && (item.checkInAt === undefined || Number.isSafeInteger(item.checkInAt) && item.checkInAt >= item.downloadedAt)
    && (item.checkInShownAt === undefined || Number.isSafeInteger(item.checkInShownAt) && item.checkInShownAt >= item.downloadedAt)
    && typeof item.dismissed === 'boolean' && Array.isArray(item.modules) && item.modules.length > 0 && item.modules.length <= 64
    && item.modules.every(module => module && text(module.id, 100) && !!communityModule(module.id) && text(module.name, 120) && text(module.version, 64))
    && new Set(item.modules.map(module => module.id)).size === item.modules.length
    && Array.isArray(item.completed) && item.completed.every(id => typeof id === 'string' && item.modules.some(module => module.id === id))
}
export function readHardwareFeedback(memberId: string, now = Date.now()): HardwareFeedback[] {
  if (!memberId) return []
  try {
    const saved = localStorage.getItem(key(memberId))
    if (!saved || saved.length > 100000) return []
    const rows: unknown = JSON.parse(saved)
    if (!Array.isArray(rows)) return []
    const retained = rows.filter(valid).filter(item => item.downloadedAt <= now && now - item.downloadedAt < FEEDBACK_RETENTION).slice(0, 3)
    if (retained.length !== rows.length) localStorage.setItem(key(memberId), JSON.stringify(retained))
    return retained
  } catch { return [] }
}
function save(memberId: string, records: HardwareFeedback[]) {
  try { localStorage.setItem(key(memberId), JSON.stringify(records)); window.dispatchEvent(new Event(FEEDBACK_CHANGED)); return true }
  catch { return false /* Optional reminders must never stop a download or a successful working confirmation. */ }
}
/** Keep the latest build of each machine. Re-downloading the same build preserves completed and dismissed feedback. */
export function rememberHardwareFeedback(memberId: string, build: DownloadedBuild, now = Date.now()) {
  if (!memberId || !build.modules.length) return
  const records = readHardwareFeedback(memberId, now), id = feedbackId(build)
  if (records.some(record => feedbackId(record) === id)) return
  const record: HardwareFeedback = { machine: build.machine, os: build.os, modules: build.modules.map(({ id, name, version }) => ({ id, name, version })), downloadedAt: now, remindAt: now + FEEDBACK_DELAY, checkInAt: now + CHECK_IN_DELAY, completed: [], dismissed: false }
  if (valid(record)) save(memberId, [record, ...records.filter(item => item.machine !== build.machine)].slice(0, 3))
}
export function pendingFeedback(record: HardwareFeedback) { return record.modules.filter(module => !record.completed.includes(module.id)) }
export function dueHardwareFeedback(memberId: string, now = Date.now()) {
  return readHardwareFeedback(memberId, now).find(item => !item.dismissed && item.remindAt <= now && pendingFeedback(item).length)
}
/** Older downloads retain their inline reminders; only newly scheduled downloads open a modal. */
export function nextHardwareCheckIn(memberId: string, now = Date.now()) {
  return readHardwareFeedback(memberId, now).filter(item => !item.dismissed && item.checkInAt !== undefined && item.checkInShownAt === undefined && pendingFeedback(item).length)
    .sort((a, b) => a.checkInAt! - b.checkInAt!)[0]
}
/** Call under the member's browser lock. Persist before opening so another tab/visit stays quiet. */
export function claimHardwareCheckIn(memberId: string, build: DownloadedBuild, now = Date.now()) {
  const records = readHardwareFeedback(memberId, now), id = feedbackId(build)
  const record = records.find(item => feedbackId(item) === id)
  if (!record || record.dismissed || record.checkInAt === undefined || record.checkInAt > now || record.checkInShownAt !== undefined || !pendingFeedback(record).length) return
  const claimed = { ...record, checkInShownAt: now }
  if (save(memberId, records.map(item => item === record ? claimed : item))) return claimed
}
export function updateHardwareFeedback(memberId: string, build: DownloadedBuild, action: 'dismiss' | 'later' | { completed: string | readonly string[] }, now = Date.now()) {
  if (!memberId) return
  const id = feedbackId(build)
  save(memberId, readHardwareFeedback(memberId, now).map(record => feedbackId(record) !== id ? record : {
    ...record,
    ...(action === 'dismiss' ? { dismissed: true } : action === 'later' ? { remindAt: now + FEEDBACK_SNOOZE, checkInShownAt: now }
      : { completed: [...new Set([...record.completed, ...(typeof action.completed === 'string' ? [action.completed] : action.completed)])].filter(moduleId => record.modules.some(module => module.id === moduleId)) }),
  }))
}
/** Used to clean up the disposable development preview's separate member namespace. */
export function forgetHardwareFeedback(memberId: string) {
  try { localStorage.removeItem(key(memberId)); window.dispatchEvent(new Event(FEEDBACK_CHANGED)) } catch { /* Optional local state. */ }
}
