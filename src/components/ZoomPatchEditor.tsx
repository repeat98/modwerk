import { useEffect, useState } from 'react'
import type { ZoomLink } from '../engine/zoom/zoom-link'

const EDITOR_ORIGIN = 'https://themanro.github.io'
const EDITOR_URL = EDITOR_ORIGIN + '/ZoomMultistompZDL/tools/editor.html'

export function ZoomPatchEditor({ link, connecting }: { link: ZoomLink | null; connecting: boolean }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(false)
  useEffect(() => {
    if (!link) return
    const editor = new AbortController()
    void link.openPatchEditor(editor.signal, () => setReady(true)).catch(() => {
      if (!editor.signal.aborted) setError(true)
    })
    return () => editor.abort()
  }, [link])

  return <>
    {link && ready && !connecting
      ? <iframe className="zoom-editor-frame" title="MultiStomp Patch Editor" src={EDITOR_URL}
          allow={'midi ' + EDITOR_ORIGIN} sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer" />
      : <p role={error ? 'alert' : 'status'} className="hub-empty">{error ? 'Could not open the Patch Editor here.' : 'Waiting for the MIDI connection…'}</p>}
    <p className="hub-cell-note"><a href={EDITOR_URL} target="_blank" rel="noreferrer">Open the ZoomMultistompZDL Patch Editor in a new tab</a></p>
  </>
}
