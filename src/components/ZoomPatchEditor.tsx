import { useEffect, useState } from 'react'
import { zoomPatchModules, type ZoomEffect } from '../devices/zoom-effects'
import type { ZoomFile, ZoomLink } from '../engine/zoom/zoom-link'
import type { ZoomCurrentPatch } from '../engine/zoom/zoom-protocol'

type PatchRead = { request: number; patch?: ZoomCurrentPatch; error?: string }

export function ZoomPatchEditor({ link, files, listed, busy, inventoryError, onRetryInventory }: {
  link: ZoomLink
  files: readonly ZoomFile[] | undefined
  listed: readonly ZoomEffect[]
  busy: boolean
  inventoryError?: string
  onRetryInventory: () => void
}) {
  const [request, setRequest] = useState(0)
  const [result, setResult] = useState<PatchRead>()
  useEffect(() => {
    let active = true
    void link.currentPatch().then(
      patch => { if (active) setResult({ request, patch }) },
      (failure: Error) => { if (active) setResult({ request, error: failure.message }) },
    )
    return () => { active = false }
  }, [link, request])

  const read = result?.request === request ? result : undefined
  const modules = read?.patch && files ? zoomPatchModules(read.patch, files, listed) : undefined

  return <>
    <div className="zoom-patch-head">
      <h2 className="hub-view-title">{read?.patch?.name || 'Active patch'}</h2>
      <button type="button" className="button button-quiet" disabled={busy || !read} onClick={() => {
        if (inventoryError) onRetryInventory()
        setRequest(n => n + 1)
      }}>Refresh patch</button>
    </div>
    {(read?.error || inventoryError) ? <p role="alert" className="hub-error">{read?.error || inventoryError}</p>
      : !modules ? <p role="status" className="hub-empty">{read?.patch ? 'Reading installed modules…' : 'Reading the active patch…'}</p>
      : !modules.cards.length ? <p className="hub-empty">{modules.installed
        ? <>{modules.installed} {modules.installed === 1 ? 'Modwerk module is' : 'Modwerk modules are'} installed on the pedal. Add one to this patch, then refresh.</>
        : 'Install a Modwerk module from a set, then add it to this patch on the pedal.'}</p>
      : <div className="zoom-patch-cards">{modules.cards.map(({ slot, module }) =>
        <article key={slot.index} className="hub-cell zoom-patch-card" aria-label={module.name + ', slot ' + (slot.index + 1)}>
          <div className="hub-cell-head">
            <h3>{module.name}</h3>
            <span className="subtle">Slot {slot.index + 1}{slot.enabled ? '' : ' · Bypassed'}</span>
          </div>
          <dl>{module.controls.slice(0, slot.values.length).map((control, index) =>
            <div key={index}><dt>{control.name}</dt><dd>{control.labels?.[slot.values[index]] ?? slot.values[index]}</dd></div>)}</dl>
        </article>,
      )}</div>}
  </>
}
