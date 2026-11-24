import { useEffect, useRef, useState } from 'react'
import type { ZoomLink, ZoomPatchEffect } from '../engine/zoom/zoom-link'
import type { ZoomIdentity } from '../engine/zoom/zoom-protocol'
import { PATCH_NAME_LENGTH, PATCH_PROGRAMS, canEditPatches, cleanName, decodePatch, encodePatch, type EffectKnobs, type Patch } from '../engine/zoom/zoom-patch'
import { useZoomLink } from '../hooks/useZoomLink'
import './zoom-patches.css'

// Knob tables already read from the pedal's effect files, by file name and size: a second visit reads none.
const KNOBS_KEY = 'modwerk-zoom-effect-knobs'
const storedKnobs = (): Record<string, EffectKnobs> => { try { return JSON.parse(localStorage.getItem(KNOBS_KEY) || '{}') } catch { return {} } }
const keepKnobs = (effects: Map<number, ZoomPatchEffect>) => {
  try { localStorage.setItem(KNOBS_KEY, JSON.stringify({ ...storedKnobs(), ...Object.fromEntries([...effects.values()].filter(e => e.knobs).map(e => [e.key, e.knobs])) })) } catch { /* storage off: read again next time */ }
}
const GROUPS: Record<number, string> = { 1: 'Dynamics', 2: 'Filter', 3: 'Drive', 4: 'Amp', 5: 'Cabinet', 6: 'Modulation', 7: 'SFX', 8: 'Delay', 9: 'Reverb' }
const effectName = (e: ZoomPatchEffect | undefined) => e?.knobs?.name ?? e?.file.replace(/\.zdl$/i, '')
// What the pedal had last (`base`: every write goes on top of it), what the page shows, and whether that differs
// from the stored program.
type Open = { program?: number; base: number[]; patch: Patch; unsaved: boolean }

/**
 * The pedal page's Patches view (ZoomHub.tsx): the MS-70CDR's patches over the Web MIDI link, as the
 * ZoomMultistompZDL patch editor edits them (zoom-patch.ts). It opens the patch the pedal plays, lists all fifty on
 * request (the pedal plays each one to send it), and edits the open one: each slot's effect, on/off and knobs, and
 * the name. Knobs move live in the slots the pedal takes a live knob message for (liveSlots); the other slots, and
 * every other change, go as one patch write into the edit buffer. Save stores it into a program. The effects' names
 * and knobs come from the pedal's own effect files.
 */
export function ZoomPatches({ link, identity, active }: { link: ZoomLink | null; identity?: ZoomIdentity; active: boolean }) {
  const { status, program } = useZoomLink(link)
  const ready = status === 'ready', busy = !ready
  const usable = !!link && !!identity && canEditPatches(identity.deviceId)
  const [open, setOpen] = useState<Open>(), [names, setNames] = useState<(string | null)[]>()
  const [effects, setEffects] = useState<Map<number, ZoomPatchEffect>>(), [error, setError] = useState<string>(), [note, setNote] = useState<string>()
  const [saveTo, setSaveTo] = useState<number>()
  const alive = useRef(true), going = useRef<number | undefined>(undefined), reading = useRef(false), writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(writeTimer.current) } }, [])
  const live = link?.liveSlots() ?? 3
  const run = (work: () => Promise<void>) => { setError(undefined); work().catch((failure: Error) => { if (alive.current) setError(failure.message) }) }

  // The effects this patch names, and every effect on the pedal for the slots' choices; known knob tables aren't read again.
  const loadEffects = async (patch: Patch) => {
    if (!link) return
    const wanted = patch.slots.map(slot => slot.effect).filter(id => id && !effects?.get(id)?.knobs)
    if (effects && !wanted.length) return
    const stored = storedKnobs(), found = await link.patchEffects(wanted, key => stored[key])
    keepKnobs(found)
    if (alive.current) setEffects(found)
  }
  const show = (dump: number[], at: number | undefined, unsaved = false) => {
    const patch = decodePatch(dump)
    setOpen({ program: at, base: dump, patch, unsaved })
    if (at !== undefined) { setSaveTo(at); setNames(list => list && Object.assign([...list], { [at]: patch.name })) }
    else setSaveTo(undefined)
    return patch
  }
  const readCurrent = () => {
    if (reading.current) return
    reading.current = true
    run(async () => {
      try {
        if (!link) return
        const lost = open?.unsaved && link.getState().program !== open.program
        const dump = await link.readPatch()
        if (!alive.current) return
        if (lost) setNote('A patch was chosen on the pedal: the changes that weren’t saved are gone.')
        await loadEffects(show(dump, link.getState().program))
      } finally { reading.current = false }
    })
  }
  const select = (at: number) => run(async () => {
    if (!link || (open?.unsaved && !window.confirm('Patch ' + ((open.program ?? 0) + 1) + ' has changes that aren’t saved. Open patch ' + (at + 1) + ' and lose them?'))) return
    going.current = at
    try {
      const dump = await link.selectProgram(at)
      if (alive.current) await loadEffects(show(dump, at))
    } finally { going.current = undefined }
  })
  const readAll = () => run(async () => {
    if (!link || !window.confirm('Reading all 50 patches makes the pedal play each one in turn for a moment: turn your amp down first. The patch you’re on comes back afterwards, with its changes that aren’t saved.')) return
    const list: (string | null)[] = Array(PATCH_PROGRAMS).fill(null)
    const { patches, program: back } = await link.readPatches((at, dump) => { list[at] = dump && decodePatch(dump).name; if (alive.current) setNames([...list]) })
    if (!alive.current) return
    setNames(patches.map(dump => dump && decodePatch(dump).name))
    // No program change said it and none of the fifty matches the edit buffer: it was edited, and readPatches wrote it back.
    if (back === undefined) setNote('The pedal didn’t say which patch it was on, and its changes match none of the 50, so they’re kept but not saved. Choose where to save them.')
    const dump = await link.readPatch()
    if (alive.current) await loadEffects(show(dump, back, !!open?.unsaved || back === undefined))
  })

  // Opens what the pedal plays when the view first shows, and again when a patch is chosen on the pedal itself.
  useEffect(() => {
    if (!active || !usable || !ready) return
    if (!open) readCurrent()
    else if (program !== undefined && program !== open.program && program !== going.current) readCurrent()
  })

  // Every change but a live knob: one patch write into the edit buffer, on top of what the pedal sent last.
  const write = (patch: Patch) => run(async () => {
    if (!link || !open || !identity) return
    const back = await link.writePatch(encodePatch(patch, open.base, identity.deviceId))
    if (!alive.current) return
    const got = decodePatch(back), lost = patch.slots.some((slot, s) => slot.effect !== got.slots[s].effect || slot.on !== got.slots[s].on) || got.name !== patch.name
    setOpen(now => now && { ...now, base: back, unsaved: true })
    if (lost) setError('The pedal didn’t keep every change: what it plays now is shown. Try once more, or change it on the pedal.')
    if (lost) setOpen(now => now && { ...now, patch: got })
  })
  const change = (patch: Patch, now = true) => {
    setOpen(o => o && { ...o, patch, unsaved: true })
    clearTimeout(writeTimer.current)
    if (now) write(patch)
    else writeTimer.current = setTimeout(() => write(patch), 250)
  }
  const withSlot = (s: number, slot: Partial<Patch['slots'][number]>): Patch => ({ ...open!.patch, slots: open!.patch.slots.map((old, i) => i === s ? { ...old, ...slot, knobs: slot.knobs ?? old.knobs } : old) })
  const turn = (s: number, k: number, value: number, released: boolean) => {
    if (!open) return
    const knobs = [...open.patch.slots[s].knobs]
    knobs[k] = value
    const patch = withSlot(s, { knobs })
    // The live message moves the knob in the edit buffer at once; other slots wait for the knob to stop.
    if (link?.knob(s, k + 2, value)) setOpen(o => o && { ...o, patch, unsaved: true })
    else if (released) change(patch, false)
    else setOpen(o => o && { ...o, patch, unsaved: true })
  }
  const pick = (s: number, id: number) => run(async () => {
    if (!link || !open) return
    let effect = effects?.get(id)
    if (effect && !effect.knobs) {
      const knobs = await link.effectKnobs(effect.file)
      effect = { ...effect, knobs }
      const next = new Map(effects); next.set(id, effect); keepKnobs(next)
      if (alive.current) setEffects(next)
    }
    const defaults = Array.from({ length: 9 }, (_, k) => effect?.knobs?.knobs[k]?.default ?? 0)
    change(withSlot(s, { effect: id, on: !!id, knobs: id ? defaults : Array(9).fill(0) }))
  })
  const save = () => run(async () => {
    if (!link || !open || !identity || saveTo === undefined) return
    if (saveTo !== open.program && names?.[saveTo] && !window.confirm('Save over patch ' + (saveTo + 1) + ', ' + names[saveTo] + '?')) return
    going.current = saveTo
    try {
      const back = await link.storePatch(saveTo, encodePatch(open.patch, open.base, identity.deviceId))
      if (!alive.current) return
      show(back, saveTo)
    } finally { going.current = undefined }
    setNote('Saved as patch ' + (saveTo + 1) + '.')
  })

  if (!link || !identity) return <><h2 className="hub-view-title">Patches</h2><p className="hub-empty">Connect your pedal to edit its patches.</p></>
  if (!usable) return <><h2 className="hub-view-title">Patches</h2><p className="hub-empty">Patches are mapped only for the MS-70CDR so far; this is an {identity.model}. Reading and editing its patches needs its patch format first.</p></>
  const midistomp = !!identity.midistomp || /^M\d{3}$/.test(identity.firmware)
  return <div className="zoom-patches">
    <div className="zoom-patches-head">
      <h2 className="hub-view-title">Patches</h2>
      <span><button type="button" className="text-button" disabled={busy} onClick={readCurrent}>Read again</button>
        <button type="button" className="text-button" disabled={busy} onClick={readAll}>{names ? 'Read all 50 again' : 'Read all 50'}</button></span>
    </div>
    {error && <p role="alert" className="hub-error">{error}</p>}
    {note && <p role="status" className="hub-cell-note">{note}</p>}
    <div className="zoom-patches-workspace">
      {names && <ol className="zoom-patch-list" aria-label="Patches on the pedal">{names.map((name, at) => <li key={at}>
        <button type="button" aria-pressed={open?.program === at} disabled={busy} onClick={() => select(at)}><span>{at + 1}</span>{name ?? <em>not read</em>}</button>
      </li>)}</ol>}
      {open ? <section className="zoom-patch" aria-label={'Patch ' + (open.program === undefined ? '' : open.program + 1)}>
        <div className="zoom-patch-title">
          <label><span>{open.program === undefined ? 'Patch' : 'Patch ' + (open.program + 1)}</span>
            <input type="text" value={open.patch.name} maxLength={PATCH_NAME_LENGTH} disabled={busy} aria-label="Patch name"
              onChange={event => setOpen({ ...open, patch: { ...open.patch, name: event.target.value.replace(/[^\x20-\x7e]/g, '').slice(0, PATCH_NAME_LENGTH) }, unsaved: true })}
              onBlur={() => { const name = cleanName(open.patch.name); if (name !== decodePatch(open.base).name) change({ ...open.patch, name }) }}
              onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }} /></label>
          <span className="zoom-patch-save">
            {open.unsaved && <small>Not saved</small>}
            <select aria-label="Save into patch" value={saveTo ?? ''} disabled={busy} onChange={event => setSaveTo(+event.target.value)}>
              {saveTo === undefined && <option value="">Save into…</option>}
              {Array.from({ length: PATCH_PROGRAMS }, (_, at) => <option key={at} value={at}>{at + 1}{names?.[at] ? ' · ' + names[at] : ''}</option>)}
            </select>
            <button type="button" className="button button-primary" disabled={busy || saveTo === undefined} onClick={save}>Save</button>
          </span>
        </div>
        {saveTo === undefined && <p className="hub-cell-note">The pedal hasn’t said which patch number this is. Choose where to save it, or read all 50 to find out.</p>}
        <ol className="zoom-slots">{open.patch.slots.map((slot, s) => {
          const effect = slot.effect ? effects?.get(slot.effect) : undefined, knobs = effect?.knobs?.knobs ?? []
          return <li key={s} className={'zoom-slot' + (slot.effect && slot.on ? ' is-on' : '')}>
            <div className="zoom-slot-head">
              <span className="zoom-slot-number">{s + 1}</span>
              <select aria-label={'Slot ' + (s + 1) + ' effect'} value={slot.effect} disabled={busy || !effects} onChange={event => pick(s, +event.target.value)}>
                <option value={0}>Empty</option>
                {slot.effect !== 0 && !effect && <option value={slot.effect}>{effects ? 'Not on this pedal' : 'Reading…'}</option>}
                {effects && Object.entries(GROUPS).map(([gid, group]) => {
                  const inGroup = [...effects.values()].filter(e => e.gid === +gid).sort((a, b) => effectName(a)!.localeCompare(effectName(b)!))
                  return inGroup.length ? <optgroup key={gid} label={group}>{inGroup.map(e => <option key={e.id} value={e.id}>{effectName(e)}</option>)}</optgroup> : null
                })}
              </select>
              {slot.effect !== 0 && <button type="button" className={'zoom-slot-toggle' + (slot.on ? ' is-on' : '')} aria-pressed={slot.on} disabled={busy} onClick={() => change(withSlot(s, { on: !slot.on }))}>{slot.on ? 'On' : 'Off'}</button>}
            </div>
            {slot.effect !== 0 && (effect?.knobs ? <div className="zoom-knobs">{knobs.map((knob, k) => <label key={k} className="zoom-knob">
              <span>{knob.name}</span>
              <input type="range" min={0} max={knob.max} value={Math.min(slot.knobs[k], knob.max)} disabled={busy}
                onChange={event => turn(s, k, +event.target.value, false)}
                onPointerUp={event => turn(s, k, +(event.target as HTMLInputElement).value, true)}
                onKeyUp={event => turn(s, k, +(event.target as HTMLInputElement).value, true)} />
              <output>{slot.knobs[k]}</output>
            </label>)}{!knobs.length && <p className="hub-empty">No knobs.</p>}</div>
              : <p className="hub-empty">{!effects ? 'Reading the effects on the pedal…' : effect ? 'This effect’s file has no knob table this page can read.' : 'The pedal has no effect file for this slot’s effect: it plays nothing here until one is installed.'}</p>)}
          </li>
        })}</ol>
        <p className="hub-cell-note">Knobs in slots 1{live > 1 ? '–' + live : ''} move as you turn them; {live < 6 ? <>in slots {live + 1}–6 they go when you let go, and</> : null} other changes go at once. The pedal plays them now and keeps them until you choose another patch: Save stores them.{midistomp && ' MIDISTOMP keeps its mixer and PERFORM settings per patch, matched by its effects and name: changing either resets them for that patch.'}</p>
      </section> : <p className="hub-empty">{busy ? 'Reading the patch…' : 'Not read yet.'}</p>}
    </div>
  </div>
}
