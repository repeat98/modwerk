import type { InventoryTarget } from './inventory'

const INSTALL = 'modwerk.octatrack.pending-base', SYNC = 'modwerk.octatrack.last-sync'
export interface PendingBase { sha256: string; expectedBase: string; previousBase?: string; returnSetId?: string }
export interface SuccessfulSync extends InventoryTarget { base: string; active: string; at: string }
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

/** Keep the installer resumable within this tab without treating a download as an installation. */
export function pendingBaseInstall(): PendingBase | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(INSTALL) ?? 'null')
    return value && hash(value.sha256) && hash(value.expectedBase) && (value.previousBase === undefined || hash(value.previousBase))
      && (value.returnSetId === undefined || typeof value.returnSetId === 'string' && value.returnSetId.length > 0 && value.returnSetId.length <= 128) ? value : undefined
  } catch { return undefined }
}
/** The download SHA and IDENTIFY configuration digest are separate identities. */
export function waitForBaseInstall(sha256: string, expectedBase: string, previousBase?: string, returnSetId?: string) {
  try { sessionStorage.setItem(INSTALL, JSON.stringify({ sha256, expectedBase, previousBase, returnSetId })) } catch { /* this visit still waits */ }
}
export function finishBaseInstall() {
  try { sessionStorage.removeItem(INSTALL) } catch { /* storage is optional */ }
}

/** The guide's Reload page (Modwerk was deployed since the page opened): the reloaded page opens the guide again, with the
 * USB Audio layout and the set it was opened for, instead of leaving the musician to find it. Only for a reload within
 * two minutes, in this tab. */
const REOPEN = 'modwerk.octatrack.base-guide-reopen'
export interface GuideReopen { layout?: string; returnSetId?: string }
export function reopenBaseGuideAfterReload(value: GuideReopen, now = Date.now()) {
  try { sessionStorage.setItem(REOPEN, JSON.stringify({ ...value, at: now })) } catch { /* the guide stays in Setup */ }
}
/** What the guide reopens with after its own reload, or nothing. Reading keeps it: `forgetBaseGuideReopen` once used. */
export function baseGuideToReopen(now = Date.now()): GuideReopen | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(REOPEN) ?? 'null')
    if (!value || typeof value.at !== 'number' || now - value.at > 120_000 || now < value.at) return undefined
    const text = (field: unknown) => typeof field === 'string' && field.length > 0 && field.length <= 128 ? field : undefined
    return { layout: text(value.layout), returnSetId: text(value.returnSetId) }
  } catch { return undefined }
}
export function forgetBaseGuideReopen() {
  try { sessionStorage.removeItem(REOPEN) } catch { /* storage is optional */ }
}

/** Record only an acknowledged Keep with a successful save, never a download, trial or Undo. */
export function rememberSuccessfulSync(value: SuccessfulSync) {
  try { localStorage.setItem(SYNC, JSON.stringify(value)) } catch { /* storage is optional */ }
}
export function lastSuccessfulSync(base?: string): SuccessfulSync | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(SYNC) ?? 'null')
    return value && hash(value.base) && hash(value.active) && (!base || value.base === base) && typeof value.name === 'string'
      && Array.isArray(value.moduleIds) && value.moduleIds.every((id: unknown) => typeof id === 'string')
      && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at)) ? value : undefined
  } catch { return undefined }
}

const LOG = 'modwerk.octatrack.sync-log'
export const SYNC_LOG_LENGTH = 20
export type SyncOutcome = 'kept' | 'undone' | 'failed'
export interface SyncRecord { at: string; name: string; modules: number; outcome: SyncOutcome; message?: string }
const syncRecord = (value: Partial<SyncRecord> | null): value is SyncRecord => !!value && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at))
  && typeof value.name === 'string' && Number.isInteger(value.modules) && value.modules! >= 0 && ['kept', 'undone', 'failed'].includes(value.outcome!)
  && (value.message === undefined || typeof value.message === 'string')
/** This browser's syncs, newest first: the base keeps no log of its own. */
export function syncHistory(): SyncRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOG) ?? '[]')
    return Array.isArray(value) ? value.filter(syncRecord).slice(0, SYNC_LOG_LENGTH) : []
  } catch { return [] }
}
export function recordSync(entry: Omit<SyncRecord, 'at'>, at = new Date().toISOString()) {
  try { localStorage.setItem(LOG, JSON.stringify([{ ...entry, at }, ...syncHistory()].slice(0, SYNC_LOG_LENGTH))) } catch { /* storage is optional */ }
}
