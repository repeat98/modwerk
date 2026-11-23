import { useEffect, useState } from 'react'
import type { DiagnosticReading } from '../community/octatrack-diagnostics-contract'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { PARTLY_RESTORED } from '../engine/elekloader/restore-outcomes'
import type { RestoreReport } from '../engine/elekloader/upload-usb'
import { useOctatrackLink } from './useOctatrackLink'

/** The base's self-test record (read-only, never uploaded), read once for each running set while the Octatrack page
 * is open: undefined while unknown, null from a base without one. */
export function useOctatrackHealth(link: OctatrackLink | null) {
  const state = useOctatrackLink(link)
  const key = state.status === 'ready' && state.identity?.canSubmit ? state.identity.base + '|' + (state.active ?? '') : ''
  const [health, setHealth] = useState<{ key: string; value: DiagnosticReading | null }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!link || !key) return
    let live = true, again: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    // Another tab or a load holding the unit skips this round; ask again shortly.
    link.health(controller.signal).then(value => { if (live) setHealth({ key, value: value ?? null }) },
      error => { if (live && (error as { retry?: boolean })?.retry) again = setTimeout(() => setAttempt(n => n + 1), 2000) })
    return () => { live = false; controller.abort(); clearTimeout(again) }
  }, [link, key, attempt])
  return health?.key === key ? health.value : undefined
}

/** After a start that loaded only part of the card's set: what its restore did with each module (request 43), read once
 * for that reading. Undefined otherwise, and from a base before the request or when the read fails, so the page keeps
 * its plain "not all loaded" line. */
export function useRestoreOutcomes(link: OctatrackLink | null, health: DiagnosticReading | null | undefined) {
  const key = health && (PARTLY_RESTORED as readonly number[]).includes(health.saved) ? `${health.saved}|${health.savedCount}|${health.live}` : ''
  const [report, setReport] = useState<{ key: string; value: RestoreReport | undefined }>()
  useEffect(() => {
    if (!link || !key) return
    let live = true
    const controller = new AbortController()
    Promise.resolve().then(() => link.restoreOutcomes(controller.signal)).then(value => { if (live) setReport({ key, value }) }, () => { if (live) setReport({ key, value: undefined }) })
    return () => { live = false; controller.abort() }
  }, [link, key])
  return report?.key === key ? report.value : undefined
}
