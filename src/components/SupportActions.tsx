import { useEffect, useState } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { supportFile, supportFileName, supportText, type SupportContext } from '../community/support-report'

type TrailLink = Pick<OctatrackLink, 'trail' | 'supportAttachment'>

function saveText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Beside a USB error: Copy details (what failed, the base with its layout, the model and the last 20 events, as text to
 * paste into a message) and Save report (a file with every event the page kept, readable and as JSON lines). Nothing is
 * sent: the member decides where the text goes. The error shown is noted for Report a problem (link-trail.ts). */
export function SupportActions({ link, what, error }: { link: TrailLink | null | undefined; what: string; error?: string }) {
  const [copied, setCopied] = useState<'copied' | 'failed'>()
  useEffect(() => { if (error) link?.trail?.noteError(error) }, [link, error])
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(undefined), 2000); return () => clearTimeout(timer) }, [copied])
  if (!link?.trail) return null
  const context = (at: Date): SupportContext => ({ what, ...(error ? { error } : {}), created: at.toISOString() })
  async function copy() {
    try { await navigator.clipboard.writeText(supportText(link!.supportAttachment(), context(new Date()))); setCopied('copied') } catch { setCopied('failed') }
  }
  function saveReport() { const at = new Date(); saveText(supportFile(link!.supportAttachment(), context(at)), supportFileName(at)) }
  return <span className="support-actions" role="group" aria-label="Details for support">
    <button type="button" className="text-button" onClick={() => void copy()}><span aria-live="polite">{copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy details'}</span></button>
    <button type="button" className="text-button" onClick={saveReport}>Save report</button>
  </span>
}
