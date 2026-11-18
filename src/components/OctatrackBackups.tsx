import { useState } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { SavedSetSnapshot } from '../engine/elekloader/upload-wire'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { Icon } from './Icon'

const UNREADABLE: Record<Exclude<SavedSetSnapshot['status'], 'ready'>, string> = {
  unsafe: 'Stop playback on the Octatrack, then try again.',
  'read-failed': 'The Octatrack couldn’t read it from the card.',
  invalid: 'It isn’t a complete module file.',
}
export function save(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/octet-stream' })), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Backups: the module files the base keeps on the card, downloaded on request through the existing read-only export.
 * A base without the export says so; nothing is written to the card or the unit. */
export function OctatrackBackups({ link }: { link: OctatrackLink | null }) {
  const state = useOctatrackLink(link), connected = state.status === 'ready' && !!state.identity?.canSubmit
  const [busy, setBusy] = useState(false), [result, setResult] = useState<{ error?: boolean; lines: string[] }>()
  async function download() {
    if (!link) return
    setBusy(true); setResult(undefined)
    try {
      const snapshots = await link.savedBackup()
      if (!snapshots) { setResult({ lines: ['The base on your Octatrack can’t export these files. That needs a newer Modwerk base.'] }); return }
      const lines: string[] = []
      for (const snapshot of snapshots) {
        const name = `modwerk-saved-modules-${snapshot.slot + 1}-${snapshot.sha256.slice(0, 8)}.bin`
        if (snapshot.status === 'ready') { save(snapshot.data, name); lines.push(`File ${snapshot.slot + 1} saved as ${name}.`) }
        else lines.push(`File ${snapshot.slot + 1}: ${UNREADABLE[snapshot.status]}`)
      }
      setResult({ error: snapshots.some(snapshot => snapshot.status !== 'ready'), lines })
    } catch (error) {
      setResult({ error: true, lines: [error instanceof Error ? error.message : 'Couldn’t read the files from your Octatrack.'] })
    } finally { setBusy(false) }
  }
  return <>
    <h2 className="hub-view-title">Backups</h2>
    <section className="hub-section" aria-labelledby="backup-card-title">
      <h3 id="backup-card-title">Module files on the card</h3>
      <p>Your Octatrack keeps the modules you kept on its card, so they come back after a restart. Download those files to keep a copy.</p>
      <p><button type="button" className="button button-quiet" disabled={!connected || busy} onClick={() => void download()}><Icon name="download" size={16} />{busy ? 'Reading the card…' : 'Download backup'}</button></p>
      {!connected && <p className="hub-empty">Connect your Octatrack to download them.</p>}
      {result && <div className={result.error ? 'file-error' : 'link-hint'} role={result.error ? 'alert' : 'status'}>{result.lines.map(line => <p key={line}>{line}</p>)}</div>}
    </section>
    <section className="hub-section" aria-labelledby="backup-sets-title">
      <h3 id="backup-sets-title">Module sets</h3>
      <p>Your module sets are saved in this browser. Export one from its ⋯ menu to keep it or move it to another computer.</p>
    </section>
    <section className="hub-section" aria-labelledby="backup-projects-title">
      <h3 id="backup-projects-title">Projects and samples</h3>
      <p>These backups don’t include your projects or samples. Copy the card to your computer in the Octatrack’s USB disk mode for those.</p>
    </section>
  </>
}
