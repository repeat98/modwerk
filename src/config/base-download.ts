import { lastInventory } from './inventory.ts'

/** The base .bin this browser last downloaded for the card, so the module file for the card can say when it is for a
 * different base: the Octatrack ignores a MODWERK0.SET another base wrote, without a message, and starts without modules. */
const LAST_BASE_DOWNLOAD = 'modwerk.octatrack.base-download'

export function rememberBaseDownload(base: string, at = new Date().toISOString()) {
  try { localStorage.setItem(LAST_BASE_DOWNLOAD, JSON.stringify({ base, at })) } catch { /* without storage the card dialog only names the base */ }
}

export function lastBaseDownload(): { base: string; at: string } | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_BASE_DOWNLOAD) ?? 'null') as unknown
    return value && typeof value === 'object' && typeof (value as { base?: unknown }).base === 'string' && typeof (value as { at?: unknown }).at === 'string' ? value as { base: string; at: string } : undefined
  } catch { return undefined }
}

/** The base this browser last knew the Octatrack to have or get: the newer of the base it last read over USB and the
 * base .bin it last downloaded. Undefined when it knows neither. */
export function knownBase(): { base: string; from: 'unit' | 'download' } | undefined {
  const seen = lastInventory(), downloaded = lastBaseDownload()
  if (seen && (!downloaded || seen.at >= downloaded.at)) return { base: seen.base, from: 'unit' }
  return downloaded && { base: downloaded.base, from: 'download' }
}
