import { communityBase } from '../hosting'
import type { DownloadedBuild } from './hardware-feedback'

/** A guest's downloaded modules, kept only on this device so that signing up later can follow them. Nothing is sent before then. */
export type PendingFollows = { ids: string[]; build?: DownloadedBuild; savedAt: number }
export const PENDING_FOLLOWS_RETENTION = 30 * 24 * 60 * 60 * 1000
const key = () => 'modwerk.pending-follows:' + communityBase()

function read(now: number): PendingFollows | null {
  try {
    const value = JSON.parse(localStorage.getItem(key()) ?? 'null') as Partial<PendingFollows> | null
    if (!value || !Array.isArray(value.ids) || !value.ids.every(id => typeof id === 'string') || typeof value.savedAt !== 'number' || now - value.savedAt > PENDING_FOLLOWS_RETENTION) return null
    return { ids: value.ids, build: value.build, savedAt: value.savedAt }
  } catch { return null }
}
/** Later downloads add to the earlier ones; the newest build is the one the hardware check-in asks about. */
export function rememberPendingFollows(ids: readonly string[], build?: DownloadedBuild, now = Date.now()) {
  if (!ids.length) return
  const merged = [...new Set([...read(now)?.ids ?? [], ...ids])]
  try { localStorage.setItem(key(), JSON.stringify({ ids: merged, build, savedAt: now })) } catch { /* The invitation still works; only the automatic follow is lost. */ }
}
export function takePendingFollows(now = Date.now()) {
  const value = read(now)
  try { localStorage.removeItem(key()) } catch { /* Nothing to clear. */ }
  return value
}
