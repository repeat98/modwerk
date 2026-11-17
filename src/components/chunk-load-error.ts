// Chrome, Firefox and Safari word a failed dynamic import differently; all of them mean the file did not arrive.
const CHUNK_FAILURE = /dynamically imported module|importing a module script failed|loading (css )?chunk .* failed|ChunkLoadError/i
export function isChunkLoadError(error: unknown) { return error instanceof Error && CHUNK_FAILURE.test(error.name + ' ' + error.message) }

const RELOADED = 'modwerk-reloaded-for-release'
/** A release deletes the files an open tab still asks for, and one reload fetches the new ones. At most once a minute and never offline, so a dropped connection cannot loop. */
export function reloadForNewRelease(reload = () => window.location.reload(), now = Date.now()) {
  try {
    if (!navigator.onLine || now - Number(sessionStorage.getItem(RELOADED)) < 60_000) return false
    sessionStorage.setItem(RELOADED, String(now))
  } catch { return false }
  reload()
  return true
}
