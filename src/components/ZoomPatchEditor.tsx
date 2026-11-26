import { useEffect, useRef, useState } from 'react'
import { zoomControlChoices } from '../devices/zoom-control-choices'
import { zoomPatchModule, type ZoomEffect } from '../devices/zoom-effects'
import type { ZoomFile, ZoomLink, ZoomPatchEffect } from '../engine/zoom/zoom-link'
import { PATCH_NAME_LENGTH, PATCH_PROGRAMS, PATCH_SLOTS, cleanPatchName, isAddedEffect, zoomPatchParameterMax, type ZoomCurrentPatch, type ZoomPatchChange, type ZoomPatchSlot } from '../engine/zoom/zoom-protocol'
import { useZoomLink } from '../hooks/useZoomLink'
import { ZoomParameterInput } from './ZoomParameterInput'

type PatchRead = { request: number; patch?: ZoomCurrentPatch; error?: string }
type EffectRead = { key: string; effects?: Map<string, ZoomPatchEffect | undefined>; error?: string }
type EffectChange = Extract<ZoomPatchChange, { gid: number }>
const GROUPS: Record<number, string> = { 1: 'Dynamics', 2: 'Filter', 3: 'Drive', 4: 'Amp', 5: 'Cabinet', 6: 'Modulation', 7: 'SFX', 8: 'Delay', 9: 'Reverb' }
const withoutSlot = (changes: Record<string, ZoomPatchChange>, slot: number) =>
  Object.fromEntries(Object.entries(changes).filter(([key]) => !key.startsWith(slot + ':')))

/**
 * The pedal page's Editor (ZoomHub.tsx): the MS-70CDR's active patch, read without changing it. Knobs in the slots
 * the pedal takes a live knob message for (liveSlots) move on the pedal as they turn; every other change (the other
 * slots' knobs, on/off, a slot's effect, the name) is staged and sent with Apply. Save stores the edit buffer into a
 * program, asking before it overwrites another patch; Read all lists the fifty and opens any of them.
 */
export function ZoomPatchEditor({ link, files, listed, busy, writable, confirmModel = () => true, inventoryError, onRetryInventory }: {
  link: ZoomLink
  files: readonly ZoomFile[] | undefined
  listed: readonly ZoomEffect[]
  busy: boolean
  writable: boolean
  /** The first write on a connection asks for the model printed on the pedal (ZoomHub's printedModel): another pedal
   * running MIDISTOMP answers as an MS-70CDR, and its patches must not get this one's layout. False: write nothing. */
  confirmModel?: () => boolean
  inventoryError?: string
  onRetryInventory: () => void
}) {
  const { program } = useZoomLink(link)
  const [request, setRequest] = useState(0)
  const [result, setResult] = useState<PatchRead>()
  const [effects, setEffects] = useState<EffectRead>()
  const [changes, setChanges] = useState<Record<string, ZoomPatchChange>>({})
  // Effects chosen for a slot and not applied yet, with their controls; the effect list's files, read when first needed.
  const [picked, setPicked] = useState<Record<number, ZoomPatchEffect>>({})
  const [choices, setChoices] = useState<{ gid: number; name: string }[]>()
  const [choosing, setChoosing] = useState<number>()
  const [names, setNames] = useState<(string | undefined)[]>()
  const [saveTo, setSaveTo] = useState<number>()
  const [working, setWorking] = useState<string>()
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  // Applied to the edit buffer and not saved since: with Auto Save off, the pedal drops them when another patch is chosen.
  const [unsaved, setUnsaved] = useState(false)
  const own = useRef(false), seen = useRef(program)
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
  // Read the effects again only when the patch's effects change, not when a knob moves.
  const effectKey = patch?.slots.map(slot => slot.gid + '/' + slot.fxid).join(' ')
  useEffect(() => {
    if (!effectKey || !files) return
    // patchEffects needs only each slot's group and ID, which the key holds.
    const slots = effectKey.split(' ').map((id, index) => { const [gid, fxid] = id.split('/').map(Number); return { index, gid, fxid, enabled: true, values: [] } })
    let active = true
    void link.patchEffects({ name: '', slots }, files).then(
      effects => { if (active) setEffects({ key: effectKey, effects }) },
      (failure: Error) => { if (active) setEffects({ key: effectKey, error: failure.message }) },
    )
    return () => { active = false }
  }, [link, effectKey, files])

  const reset = () => { setChanges({}); setPicked({}); setChoosing(undefined) }
  // A patch chosen on the pedal itself: read it (edits not applied belonged to the other one). This page's own
  // program changes (runOwn) and those while the link is busy are noted, not followed.
  useEffect(() => link.subscribe(() => {
    const { status, program } = link.getState()
    if (status !== 'ready' || own.current) { seen.current = program; return }
    if (program === seen.current) return
    seen.current = program
    if (program === undefined) return
    setChanges({}); setPicked({}); setChoosing(undefined)
    setSaveTo(undefined)
    setUnsaved(false)
    setNotice({ text: 'Patch ' + (program + 1) + ' was chosen on the pedal, so it’s shown now. Any edits not applied were dropped.' })
    setRequest(n => n + 1)
  }), [link])

  const effectRead = effects?.key === effectKey ? effects : undefined
  const waiting = !!patch?.slots.length && !effectRead && !inventoryError
  const pending = Object.values(changes)
  const editingDisabled = busy || !!working || !writable
  const live = link.liveSlots()
  const target = saveTo ?? program
  const stage = (key: string, change: ZoomPatchChange, same: boolean) => {
    setNotice(undefined)
    setChanges(current => {
      const next = { ...current }
      if (same) delete next[key]
      else next[key] = change
      return next
    })
  }
  // One of this page's own operations: its program changes aren't the pedal's, and its errors show here.
  const runOwn = async (label: string, work: () => Promise<void>) => {
    if (working) return
    own.current = true
    setWorking(label)
    setNotice(undefined)
    try { await work() } catch (error) {
      setNotice({ text: (error as Error).message, error: true })
    } finally {
      seen.current = link.getState().program
      own.current = false
      setWorking(undefined)
    }
  }
  const applyPending = async () => {
    if (!patch) return
    const applied = await link.applyPatchChanges(patch, pending)
    setResult({ request, patch: applied })
    reset()
    setUnsaved(true)
  }
  const apply = () => {
    if (!patch || !pending.length || editingDisabled || !confirmModel()) return
    void runOwn('Applying…', async () => {
      await applyPending()
      setNotice({ text: 'Patch changes applied and read back.' })
    })
  }
  const save = () => {
    if (!patch || target === undefined || editingDisabled) return
    if (!confirmModel() || (target !== program && !window.confirm('Save over patch ' + (target + 1) + (names?.[target] ? ', ' + names[target] : '') + '?'))) return
    void runOwn('Saving…', async () => {
      if (pending.length) await applyPending()
      const saved = await link.savePatch(target)
      setResult({ request, patch: saved })
      setNames(list => list && Object.assign([...list], { [target]: saved.name }))
      setSaveTo(undefined)
      setUnsaved(false)
      setNotice({ text: 'Saved as patch ' + (target + 1) + '.' })
    })
  }
  const readAll = () => {
    // It writes the edit buffer back afterwards, so it asks for the model first too.
    if (!confirmModel() || !window.confirm('Reading all 50 patches makes the pedal play each one in turn for a moment: turn your amp down first. The patch you’re on comes back afterwards, with its changes that aren’t saved.')) return
    void runOwn('Reading the patches…', async () => {
      const list: (string | undefined)[] = Array(PATCH_PROGRAMS).fill(undefined)
      const { patches, program: back } = await link.readPatches((at, read) => { list[at] = read?.name; setNames([...list]) })
      setNames(patches.map(read => read?.name))
      // No program change said where the buffer came from, and it matches none of the fifty: it was changed, and is kept.
      if (back === undefined) setNotice({ text: 'The pedal didn’t say which patch it was on, and its changes match none of the 50, so they’re kept but not saved. Choose where to save them.' })
    })
  }
  const openAt = (at: number) => {
    const losing = [pending.length && 'edits not applied', unsaved && 'changes not saved'].filter(Boolean).join(' and ')
    if (losing && !window.confirm('Open patch ' + (at + 1) + ' and lose the ' + losing + '?')) return
    void runOwn('Opening…', async () => {
      const opened = await link.openPatch(at)
      reset()
      setSaveTo(undefined)
      setUnsaved(false)
      setResult({ request, patch: opened })
    })
  }
  // A knob in a slot that takes live knob messages moves on the pedal now; elsewhere it waits for Apply.
  const turn = (slot: ZoomPatchSlot, parameter: number, value: number) => {
    const key = slot.index + ':' + parameter
    if (!changes[slot.index + ':effect'] && link.liveSlots() > slot.index && !confirmModel()) return
    if (!changes[slot.index + ':effect'] && link.liveKnob(slot.index, parameter, value)) {
      setNotice(undefined)
      setUnsaved(true)
      setChanges(current => { const next = { ...current }; delete next[key]; return next })
      setResult(now => now?.patch ? { ...now, patch: { ...now.patch, slots: now.patch.slots.map(s => s.index !== slot.index ? s : { ...s, values: s.values.map((v, i) => i === parameter ? value : v) }) } } : now)
      return
    }
    stage(key, { slot: slot.index, parameter, value }, value === slot.values[parameter])
  }
  const choose = (index: number) => {
    setChoosing(index)
    if (!choices) void link.effectChoices().then(setChoices, (failure: Error) => setNotice({ text: failure.message, error: true }))
  }
  const pick = async (index: number, name: string) => {
    setChoosing(undefined)
    if (!name) {
      setPicked(now => { const next = { ...now }; delete next[index]; return next })
      setChanges(current => ({ ...withoutSlot(current, index), [index + ':effect']: { slot: index, gid: 0, fxid: 0, values: [] } }))
      return
    }
    const file = files?.find(f => f.name.toUpperCase() === name.toUpperCase())
    if (!file) return setNotice({ text: name + ' is in the effect list but not on the pedal. Read the pedal again.', error: true })
    try {
      const entry = await link.slotEffect(file)
      const values = Array.from({ length: 9 }, (_, p) => Math.min(entry.controls?.parameters[p]?.default ?? 0, zoomPatchParameterMax(index, p)))
      const { gid, fxid } = entry.file.effect!
      setPicked(now => ({ ...now, [index]: entry }))
      setChanges(current => ({ ...withoutSlot(current, index), [index + ':effect']: { slot: index, gid, fxid, values } }))
    } catch (failure) {
      setNotice({ text: (failure as Error).message, error: true })
    }
  }
  const picker = (index: number) => choosing === index && <span className="zoom-patch-pick">
    <select aria-label={'Effect for slot ' + (index + 1)} disabled={!choices || editingDisabled} defaultValue="-" onChange={event => void pick(index, event.currentTarget.value)}>
      <option value="-" disabled>{choices ? 'Choose an effect' : 'Reading the effect list…'}</option>
      <option value="">Empty</option>
      {choices && [...new Set(choices.map(c => c.gid))].sort((a, b) => a - b).map(gid => <optgroup key={gid} label={GROUPS[gid] ?? 'Group ' + gid}>
        {choices.filter(c => c.gid === gid).map(c => <option key={c.name} value={c.name}>{c.name.replace(/\.zdl$/i, '')}</option>)}
      </optgroup>)}
    </select>
    <button type="button" className="text-button" onClick={() => setChoosing(undefined)}>Cancel</button>
  </span>

  const readError = read?.error || inventoryError || effectRead?.error
  const staged = (index: number) => changes[index + ':effect'] as EffectChange | undefined
  const nameChange = changes.name as { name: string } | undefined
  const card = (slot: ZoomPatchSlot, entry: ZoomPatchEffect | undefined, newEffect: boolean) => {
    const module = entry && zoomPatchModule(entry.file, listed)
    const name = module?.name ?? entry?.controls?.name ?? entry?.file.name.replace(/\.zdl$/i, '') ?? 'Unknown effect'
    const source = module ? 'Modwerk' : entry ? (isAddedEffect(entry.file.effect) ? 'Installed effect' : 'Stock effect') : undefined
    const controls = entry?.controls?.parameters
    const catalogControls = entry?.file.effect?.version === module?.platform.effectVersion ? module?.controls : undefined
    const switchKey = slot.index + ':enabled', toggle = changes[switchKey]
    const enabled = toggle && 'enabled' in toggle ? toggle.enabled : slot.enabled
    return <article key={slot.index} className="hub-cell zoom-patch-card" aria-label={name + ', slot ' + (slot.index + 1)}>
      <div className="hub-cell-head">
        <div><h3>{name}</h3><span className="subtle">Slot {slot.index + 1}{source && ' · ' + source}{newEffect && ' · not applied'}</span></div>
        <button type="button" className="button button-quiet zoom-patch-enable" aria-label={name + ' on, slot ' + (slot.index + 1)} aria-pressed={enabled}
          disabled={editingDisabled || !entry} onClick={() => stage(switchKey, { slot: slot.index, enabled: !enabled }, slot.enabled === !enabled)}>
          {enabled ? 'On' : 'Bypassed'}
        </button>
        {writable && choosing !== slot.index && <button type="button" className="text-button" aria-label={'Change the effect in slot ' + (slot.index + 1)} disabled={editingDisabled || !files} onClick={() => choose(slot.index)}>Change</button>}
      </div>
      {picker(slot.index)}
      {controls?.length ? <div className="zoom-parameters">{controls.slice(0, slot.values.length).map((control, parameter) => {
        const key = slot.index + ':' + parameter, change = changes[key]
        const value = change && 'value' in change ? change.value : slot.values[parameter]
        const documented = catalogControls?.[parameter], label = documented?.name ?? control.name
        const max = Math.min(control.max, zoomPatchParameterMax(slot.index, parameter))
        const choices = module && catalogControls && zoomControlChoices(module.platform.effectId.fxid, control.name, max, documented?.labels)
        if (max === 0 || value > max) return <div key={key} className="zoom-parameter"><span>{label}</span><span>{documented?.labels?.[value] ?? value}</span></div>
        return <ZoomParameterInput key={key} name={label} value={value} max={max} choices={choices} disabled={editingDisabled}
          onChange={next => newEffect ? stage(key, { slot: slot.index, parameter, value: next }, next === slot.values[parameter]) : turn(slot, parameter, next)} />
      })}</div> : catalogControls?.length ? <dl>{catalogControls.slice(0, slot.values.length).map((control, index) =>
        <div key={index}><dt>{control.name}</dt><dd>{control.labels?.[slot.values[index]] ?? slot.values[index]}</dd></div>,
      )}</dl> : <p className="hub-cell-note">{controls ? 'This effect has no adjustable parameters.' : 'Parameters unavailable for this effect.'}</p>}
    </article>
  }
  const slotViews = patch && Array.from({ length: PATCH_SLOTS }, (_, index) => {
    const change = staged(index), current = patch.slots.find(slot => slot.index === index)
    if (change && (change.gid || change.fxid)) return card({ index, gid: change.gid, fxid: change.fxid, enabled: true, values: [...change.values] }, picked[index], true)
    if (current && !change) return card(current, effectRead?.effects?.get(current.gid + '/' + current.fxid), false)
    if (!writable) return null
    return <div key={index} className="hub-cell zoom-patch-slot-empty">
      <span className="subtle">Slot {index + 1} · {change ? 'emptied when applied' : 'empty'}</span>
      {choosing !== index && <button type="button" className="text-button" disabled={editingDisabled || !files} onClick={() => choose(index)}>Add effect</button>}
      {picker(index)}
    </div>
  })

  return <>
    <div className="zoom-patch-head">
      <h2 className="hub-view-title">{patch?.name || 'Active patch'}</h2>
      {program !== undefined && <span className="subtle zoom-patch-number">Patch {program + 1}</span>}
      <button type="button" className="button button-quiet" disabled={busy || !!working || !read || waiting} onClick={() => {
        if (inventoryError) onRetryInventory()
        reset()
        setNotice(undefined)
        setRequest(n => n + 1)
      }} title={pending.length ? 'Discard unapplied edits and reread the patch' : undefined}>Refresh patch</button>
    </div>
    {readError && <p role="alert" className="hub-error">{readError}</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'hub-error' : 'hub-empty'}>{notice.text}</p>}
    {patch && writable && <div className="zoom-patch-tools">
      <label className="zoom-patch-name"><span>Name</span>
        <input type="text" maxLength={PATCH_NAME_LENGTH} value={nameChange?.name ?? patch.name} disabled={editingDisabled} aria-label="Patch name"
          onChange={event => { const name = event.currentTarget.value.replace(/[^\x20-\x7e]/g, ''); stage('name', { name }, cleanPatchName(name) === patch.name) }} />
      </label>
      <label className="zoom-patch-save"><span>Save into</span>
        <select value={target ?? ''} disabled={editingDisabled} onChange={event => setSaveTo(Number(event.currentTarget.value))}>
          {target === undefined && <option value="">Choose a patch</option>}
          {Array.from({ length: PATCH_PROGRAMS }, (_, at) => <option key={at} value={at}>{at + 1}{names?.[at] ? ' · ' + names[at] : ''}</option>)}
        </select>
      </label>
      <button type="button" className="button button-quiet" disabled={editingDisabled || target === undefined} onClick={save}>{working === 'Saving…' ? 'Saving…' : 'Save'}</button>
      {unsaved && !pending.length && <span className="subtle">Not saved</span>}
    </div>}
    {pending.length > 0 && <div className="zoom-patch-apply">
      <p className="hub-empty">The pedal’s Auto Save setting controls whether edits are saved.</p>
      <button type="button" className="button button-quiet" disabled={busy || !!working} onClick={() => {
        reset()
        setNotice(undefined)
      }}>Discard edits</button>
      <button type="button" className="button button-primary" disabled={editingDisabled} onClick={apply}>{working === 'Applying…' ? 'Applying…' : 'Apply to pedal'}</button>
    </div>}
    {!read || waiting ? <p role="status" className="hub-empty">{patch ? 'Reading patch effects…' : 'Reading the active patch…'}</p>
      : patch && <>
        {!patch.slots.length && <p className="hub-empty">This patch is empty. {writable ? 'Add an effect below, or on the pedal.' : 'Add an effect on the pedal, then refresh.'}</p>}
        <div className="zoom-patch-cards">{slotViews}</div>
      </>}
    {patch && writable && <p className="hub-cell-note">Knobs in slots 1{live > 1 ? '–' + live : ''} move on the pedal as you turn them{live < PATCH_SLOTS ? '; the other slots’ knobs, and every other change, wait for Apply' : '; every other change waits for Apply'}. Save stores the patch as the pedal has it.</p>}
    {patch?.slots.length ? !writable && <p className="hub-empty">Patch editing is available on Zoom 2.10, MIDISTOMP 2.0.1 and 2.0.4 or later, and development build D004.</p> : null}
    <section className="zoom-patch-programs" aria-label="Patches on the pedal">
      <div className="zoom-patch-head">
        <h3>Patches on the pedal</h3>
        <button type="button" className="button button-quiet" disabled={editingDisabled || !read} onClick={readAll}>{working === 'Reading the patches…' ? 'Reading…' : names ? 'Read all 50 again' : 'Read all 50'}</button>
      </div>
      {names ? <ol className="zoom-patch-list">{names.map((name, at) => <li key={at}>
        <button type="button" aria-current={program === at || undefined} disabled={busy || !!working} onClick={() => openAt(at)}><span>{at + 1}</span>{name ?? <em>not read</em>}</button>
      </li>)}</ol> : <p className="hub-empty">Read all 50 to list them and open any of them. The pedal plays each one for a moment.</p>}
    </section>
  </>
}
