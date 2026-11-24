import { useEffect, useState } from 'react'
import { zoomControlChoices } from '../devices/zoom-control-choices'
import { zoomPatchModule, type ZoomEffect } from '../devices/zoom-effects'
import type { ZoomFile, ZoomLink, ZoomPatchEffect } from '../engine/zoom/zoom-link'
import { isAddedEffect, zoomPatchParameterMax, type ZoomCurrentPatch, type ZoomPatchChange } from '../engine/zoom/zoom-protocol'
import { ZoomParameterInput } from './ZoomParameterInput'

type PatchRead = { request: number; patch?: ZoomCurrentPatch; error?: string }
type EffectRead = { patch: ZoomCurrentPatch; effects?: Map<string, ZoomPatchEffect | undefined>; error?: string }

export function ZoomPatchEditor({ link, files, listed, busy, writable, inventoryError, onRetryInventory }: {
  link: ZoomLink
  files: readonly ZoomFile[] | undefined
  listed: readonly ZoomEffect[]
  busy: boolean
  writable: boolean
  inventoryError?: string
  onRetryInventory: () => void
}) {
  const [request, setRequest] = useState(0)
  const [result, setResult] = useState<PatchRead>()
  const [effects, setEffects] = useState<EffectRead>()
  const [changes, setChanges] = useState<Record<string, ZoomPatchChange>>({})
  const [applying, setApplying] = useState(false)
  const [applyNotice, setApplyNotice] = useState<{ text: string; error?: boolean }>()
  useEffect(() => {
    let active = true
    void link.currentPatch().then(
      patch => { if (active) setResult({ request, patch }) },
      (failure: Error) => { if (active) setResult({ request, error: failure.message }) },
    )
    return () => { active = false }
  }, [link, request])

  const read = result?.request === request ? result : undefined
  const patch = read?.patch
  useEffect(() => {
    if (!patch || !files || !patch.slots.length) return
    let active = true
    void link.patchEffects(patch, files).then(
      effects => { if (active) setEffects({ patch, effects }) },
      (failure: Error) => { if (active) setEffects({ patch, error: failure.message }) },
    )
    return () => { active = false }
  }, [link, patch, files])

  const effectRead = effects?.patch === patch ? effects : undefined
  const waiting = !!patch?.slots.length && !effectRead && !inventoryError
  const pending = Object.values(changes)
  const editingDisabled = busy || applying || !writable
  const stage = (key: string, change: ZoomPatchChange, same: boolean) => {
    setApplyNotice(undefined)
    setChanges(current => {
      const next = { ...current }
      if (same) delete next[key]
      else next[key] = change
      return next
    })
  }
  const apply = async () => {
    if (!patch || !pending.length || editingDisabled) return
    setApplying(true)
    setApplyNotice(undefined)
    try {
      const applied = await link.applyPatchChanges(patch, pending)
      setResult({ request, patch: applied })
      if (effectRead) setEffects({ ...effectRead, patch: applied })
      setChanges({})
      setApplyNotice({ text: 'Patch changes applied and read back.' })
    } catch (error) {
      setApplyNotice({ text: (error as Error).message, error: true })
    } finally {
      setApplying(false)
    }
  }

  const readError = read?.error || inventoryError || effectRead?.error
  return <>
    <div className="zoom-patch-head">
      <h2 className="hub-view-title">{patch?.name || 'Active patch'}</h2>
      <button type="button" className="button button-quiet" disabled={busy || applying || !read || waiting} onClick={() => {
        if (inventoryError) onRetryInventory()
        setChanges({})
        setApplyNotice(undefined)
        setRequest(n => n + 1)
      }} title={pending.length ? 'Discard unapplied edits and reread the patch' : undefined}>Refresh patch</button>
    </div>
    {readError && <p role="alert" className="hub-error">{readError}</p>}
    {applyNotice && <p role={applyNotice.error ? 'alert' : 'status'} className={applyNotice.error ? 'hub-error' : 'hub-empty'}>{applyNotice.text}</p>}
    {pending.length > 0 && <div className="zoom-patch-apply">
      <p className="hub-empty">The pedal’s Auto Save setting controls whether edits are saved.</p>
      <button type="button" className="button button-quiet" disabled={busy || applying} onClick={() => {
        setChanges({})
        setApplyNotice(undefined)
      }}>Discard edits</button>
      <button type="button" className="button button-primary" disabled={editingDisabled} onClick={apply}>{applying ? 'Applying…' : 'Apply to pedal'}</button>
    </div>}
    {!read || waiting ? <p role="status" className="hub-empty">{patch ? 'Reading patch effects…' : 'Reading the active patch…'}</p>
      : patch && !patch.slots.length ? <p className="hub-empty">This patch is empty. Add an effect on the pedal, then refresh.</p>
      : patch && <div className="zoom-patch-cards">{patch.slots.map(slot => {
        const entry = effectRead?.effects?.get(slot.gid + '/' + slot.fxid)
        const module = entry && zoomPatchModule(entry.file, listed)
        const name = module?.name ?? entry?.controls?.name ?? entry?.file.name.replace(/\.zdl$/i, '') ?? 'Unknown effect'
        const source = module ? 'Modwerk' : entry ? (isAddedEffect(entry.file.effect) ? 'Installed effect' : 'Stock effect') : undefined
        const controls = entry?.controls?.parameters
        const catalogControls = entry?.file.effect?.version === module?.platform.effectVersion ? module?.controls : undefined
        const switchKey = slot.index + ':enabled', toggle = changes[switchKey]
        const enabled = toggle && 'enabled' in toggle ? toggle.enabled : slot.enabled
        return <article key={slot.index} className="hub-cell zoom-patch-card" aria-label={name + ', slot ' + (slot.index + 1)}>
          <div className="hub-cell-head">
            <div><h3>{name}</h3><span className="subtle">Slot {slot.index + 1}{source && ' · ' + source}</span></div>
            <button type="button" className="button button-quiet zoom-patch-enable" aria-label={name + ' on, slot ' + (slot.index + 1)} aria-pressed={enabled}
              disabled={editingDisabled || !entry} onClick={() => stage(switchKey, { slot: slot.index, enabled: !enabled }, slot.enabled === !enabled)}>
              {enabled ? 'On' : 'Bypassed'}
            </button>
          </div>
          {controls?.length ? <div className="zoom-parameters">{controls.slice(0, slot.values.length).map((control, parameter) => {
            const key = slot.index + ':' + parameter, change = changes[key]
            const value = change && 'value' in change ? change.value : slot.values[parameter]
            const documented = catalogControls?.[parameter], label = documented?.name ?? control.name
            const max = Math.min(control.max, zoomPatchParameterMax(slot.index, parameter))
            const choices = module && catalogControls && zoomControlChoices(module.platform.effectId.fxid, control.name, max, documented?.labels)
            if (max === 0 || value > max) return <div key={key} className="zoom-parameter"><span>{label}</span><span>{documented?.labels?.[value] ?? value}</span></div>
            return <ZoomParameterInput key={key} name={label} value={value} max={max} choices={choices} disabled={editingDisabled}
              onChange={next => stage(key, { slot: slot.index, parameter, value: next }, next === slot.values[parameter])} />
          })}</div> : catalogControls?.length ? <dl>{catalogControls.slice(0, slot.values.length).map((control, index) =>
            <div key={index}><dt>{control.name}</dt><dd>{control.labels?.[slot.values[index]] ?? slot.values[index]}</dd></div>,
          )}</dl> : <p className="hub-cell-note">{controls ? 'This effect has no adjustable parameters.' : 'Parameters unavailable for this effect.'}</p>}
        </article>
      })}</div>}
    {patch?.slots.length ? !writable && <p className="hub-empty">Patch editing is available on Zoom 2.10, MIDISTOMP 2.0.1 and development build D004.</p> : null}
  </>
}
