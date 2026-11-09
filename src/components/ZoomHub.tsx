import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DeviceImage } from '../devices/DeviceImage'
import { zoomHubHref, type ZoomHubView } from '../devices/zoom-hub-route'
import { deviceHref, type DeviceProfile } from '../devices/registry'
import { ZOOM_EFFECTS, fetchZoomEffect, zoomSyncPlan, type ZoomEffect } from '../devices/zoom-effects'
import type { Configuration } from '../config/workspace'
import type { ZoomFile, ZoomLink } from '../engine/zoom/zoom-link'
import { ZOOM_BASE, ZOOM_DEVICE_IDS, canWriteFiles, effectInfo, installRefusal, isAddedEffect, isUpdateMode } from '../engine/zoom/zoom-protocol'
import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import { useZoomLink } from '../hooks/useZoomLink'
import { avoidFor, rememberId } from '../engine/zoom/local-ids'
import { Icon, type IconName } from './Icon'
import { ZoomLoad } from './ZoomLoad'
import { HubSetHead, HubSetList, type SetAction } from './HubSets'
import { ModuleGrid } from './ModuleGrid'
import { ZoomEffectPreview } from '../devices/ZoomEffectDetail'

// A pedal set has no JSON backup yet (its format is still to come); the other actions work as on the Octatrack.
const SET_ACTIONS: SetAction[] = ['rename', 'duplicate', 'share', 'delete']
import './octatrack-link.css'
import './zoom-hub.css'

const VIEWS: { view: ZoomHubView; title: string; icon: IconName }[] = [
  { view: 'status', title: 'Status', icon: 'grid' },
  { view: 'backups', title: 'Backups', icon: 'download' },
  { view: 'setup', title: 'Setup', icon: 'sliders' },
]
/** The sidebar's action under a Zoom pedal, as under the Octatrack (OctatrackSidebarStatus): connect it, or install
 * the base on an MS-70CDR that runs Zoom's firmware or waits in update mode. */
export function ZoomSidebarStatus({ link, onInstall }: { link: ZoomLink; onInstall: () => void }) {
  const { status, identity } = useZoomLink(link)
  if (status === 'idle') return <button type="button" className="instrument-action" title="Plug the pedal in by USB, then allow MIDI for this site." onClick={() => void link.connect()}><span>Connect pedal</span><Icon name="arrow" size={14} /></button>
  if (status !== 'ready' || identity?.deviceId !== 0x61 || identity.firmware === ZOOM_BASE.tag) return null
  return <button type="button" className="instrument-action" title={isUpdateMode(identity) ? 'In update mode: the base can go on now.' : 'Zoom’s firmware 2.10. Flash the base once over USB.'} onClick={onInstall}><span>Install the base</span><Icon name="arrow" size={14} /></button>
}
const kb = (bytes: number) => Math.round(bytes / 1024) + ' KB'
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)
const isCapture = (name: string) => /^(NAM|C)\d/i.test(name)

/**
 * Your Zoom pedal: the Octatrack page (OctatrackHub.tsx) for a Zoom MultiStomp, beta only. The pedal's own
 * pages on the leading side, the selected one on the trailing side, over the Web MIDI link (zoom-link.ts).
 * It identifies the pedal, lists what's on it, backs it up, and installs or removes added effect files (the link
 * refuses Zoom's own and known ID clashes). On the MS-70CDR it offers the base (`onInstall` opens ZoomBaseDialog), as the Octatrack's page does.
 * Status is the Octatrack's console: the base's load (ZoomLoad), the firmware, and the effects on the pedal, read by itself.
 */
/** `listed`: the library's effects for this pedal. */
export function ZoomHub({ device, view, link, header, onInstall, sets, selectedId, onSelect, onNew, onSetAction, onToggle, listed = ZOOM_EFFECTS.filter(effect => effect.machine === device.id) }: {
  device: DeviceProfile; view: ZoomHubView; link: ZoomLink | null; header?: ReactNode; onInstall?: () => void
  /** The pedal's module sets beside its own pages, as on the Octatrack's: opening one makes it the set you edit, Sync brings the pedal to it. */
  sets?: Configuration[]; selectedId?: string; onSelect?: (id: string) => void; onNew?: () => void; onSetAction?: (id: string, action: SetAction) => void
  /** Takes an effect out of the open set, or keeps one the next sync would remove. */
  onToggle?: (id: string) => void
  listed?: readonly ZoomEffect[]
}) {
  const mobile = useMobileWorkspace()
  const state = useZoomLink(link), { status, identity, notice, progress } = state
  const connected = status === 'ready' || status === 'reading' || status === 'writing', busy = status === 'reading' || status === 'writing' || status === 'connecting'
  const expected = ZOOM_DEVICE_IDS[device.id], other = connected && identity && expected !== undefined && identity.deviceId !== expected
  const model = identity?.model ?? device.name, updating = connected && isUpdateMode(identity)
  const writable = canWriteFiles(identity), readOnly = writable ? undefined : 'Installing and removing effects is tested only on the MS-70CDR with Zoom’s firmware 2.10 or the base.'
  // The base answers the identity request with its tag; an MS-70CDR without it can have it installed.
  const canBase = device.id === 'zoom-ms-70cdr' && !!onInstall, onBase = connected && identity?.deviceId === 0x61 && identity.firmware === ZOOM_BASE.tag
  // What was read belongs to the pedal it was read from: gone when that pedal is.
  const pedalKey = connected && identity ? identity.deviceId + ':' + identity.firmware : ''
  const [onPedal, setOnPedal] = useState<{ key: string; files: ZoomFile[]; free?: number }>()
  const files = onPedal && onPedal.key === pedalKey ? onPedal.files : undefined, free = files ? onPedal!.free : undefined
  const [backup, setBackup] = useState<{ url: string; name: string; files: number }>(), [error, setError] = useState<string>()
  useEffect(() => () => { if (backup) URL.revokeObjectURL(backup.url) }, [backup])
  // Work keeps going on the link after the page closes; its result is then dropped.
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  // A failed change to the effect list still offers the list from before (the error's previousList) for saving.
  const run = (work: () => Promise<void>) => { setError(undefined); work().catch(e => { if (!alive.current) return; setError((e as Error).message); const list = keepList((e as { previousList?: number[] }).previousList); if (list) setChanged({ text: '', list }) }) }
  const read = () => run(async () => { if (!link) return; const listed = await link.listFiles({ versions: true }), space = await link.freeSpace(); if (alive.current) setOnPedal({ key: pedalKey, files: listed, free: space }) })
  // Installing and removing: confirm, offer the effect list from before for saving, then read again.
  const [changed, setChanged] = useState<{ text: string; list?: { url: string; name: string } }>()
  useEffect(() => () => { if (changed?.list) URL.revokeObjectURL(changed.list.url) }, [changed])
  const keepList = (list?: number[]) => list && { url: URL.createObjectURL(new Blob([Uint8Array.from(list)])), name: 'pedal-FLST_SEQ-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.ZDT' }
  const install = (file: File) => run(async () => {
    if (!link) return
    const data = new Uint8Array(await file.arrayBuffer()), refused = installRefusal(file.name, data), name = file.name.toUpperCase()
    if (refused) throw new Error(refused)
    const info = effectInfo(data)!
    if (!window.confirm('Install ' + name + ' (version ' + info.version + ', effect ID ' + info.gid + '/' + info.fxid + ', ' + kb(data.length) + ')? If another effect on the pedal has that ID, this one gets a free ID from 958 to 1023 instead. It is written, read back and added to the pedal’s effect list. Don’t touch the pedal or the cable until it’s done.')) return
    const result = await link.installFile(name, data, { avoid: avoidFor(name) }), moved = result.moved
    if (moved) rememberId(moved.to, name)
    const done = result.unchanged ? name + ' is already this exact file.' : name + ' installed and read back identical. Power-cycle the pedal to load it.'
    const where = !moved ? '' : 'clash' in moved ? ' ' + moved.clash + ' already has ID ' + info.gid + '/' + moved.from + ', so ' + name + ' is ' + info.gid + '/' + moved.to + ' on this pedal. Patches made elsewhere with ' + name + ' won’t find it here.' : ' It keeps ID ' + info.gid + '/' + moved.to + ', which it was given when it was installed, so your patches still find it.'
    if (alive.current) setChanged({ text: done + where, list: keepList(result.previousList) })
    await read()
  })
  // Sync: the pedal to the set, as the Octatrack's: the set's effects in, listed effects it dropped out; nothing else is touched.
  const selected = sets?.find(item => item.id === selectedId) ?? sets?.[0]
  const plan = selected && files ? zoomSyncPlan(listed, selected.moduleIds, files) : undefined
  // installFile keeps 8 KB free when it writes a new file; removals go first.
  const fits = !plan?.install.length || free === undefined || free >= plan.adds + 8192
  const [syncing, setSyncing] = useState<{ what: string; step: number; steps: number }>()
  // A set's LED: the pedal holds exactly its effects (current) and no other listed ones.
  const holdsSet = (item: Configuration) => !!files && item.moduleIds.length > 0 && (({ install, remove }) => !install.length && !remove.length)(zoomSyncPlan(listed, item.moduleIds, files))
  const names = (item: Pick<Configuration, 'moduleIds'>) => listed.filter(effect => item.moduleIds.includes(effect.id)).map(effect => effect.name).join(' · ')
  const sync = () => run(async () => {
    if (!link || !plan) return
    const names = (effects: readonly ZoomEffect[]) => effects.map(effect => effect.name).join(', ')
    if (!window.confirm('Sync your set to the ' + model + '? ' + (plan.install.length ? 'Installs ' + names(plan.install) + '. ' : '') + (plan.remove.length ? 'Removes ' + names(plan.remove) + ', which your set no longer has. ' : '') + 'Every write is read back, and the effect list from before is kept. Don’t touch the pedal or the cable until it’s done.')) return
    let previousList: number[] | undefined, step = 0, what = ''
    const steps = plan.remove.length + plan.install.length, say = (next: string) => { what = next; step++; if (alive.current) setSyncing({ what, step, steps }) }
    try {
      for (const effect of plan.remove) { say('Removing ' + effect.name); previousList ??= (await link.removeFile(effect.platform.file)).previousList }
      for (const effect of plan.install) {
        say('Installing ' + effect.name)
        const file = effect.platform.file.toUpperCase(), result = await link.installFile(file, await fetchZoomEffect(effect), { avoid: avoidFor(file) })
        if (result.moved) rememberId(result.moved.to, file)
        previousList ??= result.previousList
      }
    } catch (error) {
      // A failed step stops the sync and the steps before it stay done: say which, and offer the effect list from before the sync.
      throw Object.assign(new Error(what + ' failed (step ' + step + ' of ' + steps + (step > 1 ? '; the steps before it are done' : '') + '). ' + (error as Error).message, { cause: error }), { previousList: previousList ?? (error as { previousList?: number[] }).previousList })
    } finally { if (alive.current) setSyncing(undefined) }
    if (alive.current) setChanged({ text: 'Your ' + model + ' has your set. Power-cycle the pedal to load it.', list: keepList(previousList) })
    await read()
  })
  const uninstall = (file: ZoomFile) => run(async () => {
    if (!link || !window.confirm('Remove ' + file.name + ' from the pedal? Patches that use it will show an empty slot.')) return
    const result = await link.removeFile(file.name)
    if (alive.current) setChanged({ text: file.name + ' removed. Power-cycle the pedal.', list: keepList(result.previousList) })
    await read()
  })
  // Status reads what's on the pedal by itself, once per pedal; Read again is in its cell.
  const asked = useRef('')
  useEffect(() => { if (view === 'status' && status === 'ready' && pedalKey && !updating && !other && asked.current !== pedalKey) { asked.current = pedalKey; read() } })
  const save = () => run(async () => {
    if (!link) return
    const { files: count, zip } = await link.backup(), stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    if (alive.current) setBackup({ url: URL.createObjectURL(zip), name: device.id + '-backup-' + stamp + '.zip', files: count })
  })

  const line: ReactNode = status === 'unsupported' ? 'This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.'
    : status === 'connecting' ? 'Looking for your pedal…'
    : progress ? <>{progress.label}{progress.total ? <> · {progress.done} of {progress.total}</> : '…'}</>
    : updating ? <>Connected in update mode · bootloader {identity!.firmware}</>
    : onBase ? <>Connected · {identity?.midistomp ? 'MIDISTOMP ' + identity.midistomp.version : ZOOM_BASE.name}{files && <> · {files.length} files on it</>}{free !== undefined && <> · {kb(free)} free</>}</>
    : connected ? <>Connected · firmware {identity?.firmware || 'unknown'}{files && <> · {files.length} files on it</>}{free !== undefined && <> · {kb(free)} free</>}</>
    : notice ? notice.text : 'Not connected'
  const action = status === 'idle' ? <button className="button button-quiet" onClick={() => void link?.connect()}>Connect</button>
    : canBase && connected && !onBase && !other ? <button className="button button-primary" disabled={busy} onClick={onInstall}>Install base</button> : null
  const led = connected ? 'on' : busy ? 'load' : 'off'
  const panel = (name: ZoomHubView, content: ReactNode) => <section key={name} className={'hub-view hub-view-' + name} hidden={view !== name} aria-label={name === 'set' ? selected?.name ?? 'Module set' : VIEWS.find(item => item.view === name)!.title}>{content}</section>
  const effects = files?.filter(f => /\.zdl$/i.test(f.name)) ?? [], captures = effects.filter(f => isCapture(f.name))

  if (mobile) return <div className="configuration-page">{header}<p>Connecting a Zoom pedal needs Chrome or Edge on a computer.</p></div>
  return <div className="configuration-page octatrack-hub zoom-hub">
    {header}
    <div className="hub-split">
      <header className="hub-hero">
        <DeviceImage device={device} eager />
        <div><h2 className="hub-view-title">{model}</h2>
          <p role="status"><span className={'unit-led is-' + led} aria-hidden="true" />{line}</p>
          {other && <p role="alert">This is an {identity!.model}, not an {device.name}. Open its own page, or plug in the {device.name}.</p>}
        </div>
        {action}
      </header>
      <nav className="hub-nav" aria-label={'Your ' + device.name}>
        <div className="hub-nav-group">
          <h2 className="hub-nav-label">{device.name}</h2>
          <ul className="hub-nav-list">{VIEWS.map(item => <li key={item.view}><a className="hub-nav-item" href={zoomHubHref(device.id, item.view)} aria-current={view === item.view ? 'page' : undefined}><Icon name={item.icon} size={16} /><span>{item.title}</span></a></li>)}</ul>
        </div>
        {sets && onSelect && onNew && onSetAction && <HubSetList sets={sets} selected={selected} open={view === 'set'} contents={names} onSelect={onSelect} onNew={onNew} onSetAction={onSetAction} actions={SET_ACTIONS}
          state={item => { const on = connected && holdsSet(item); return { on, label: on ? 'On your ' + model : undefined } }} />}
      </nav>
      <div className="hub-pane">
        {panel('status', <div className="hub-console">
          <ZoomLoad key={pedalKey} link={link} identity={connected && !other ? identity : undefined} active={view === 'status'} />
          <section className="hub-cell hub-cell-health" aria-labelledby="zoom-firmware-cell">
            <h3 id="zoom-firmware-cell">Firmware</h3>
            {!connected ? <p className="hub-empty">Connect your pedal to read it.</p>
              : other ? <p className="hub-empty">This is an {identity!.model}: open its own page.</p>
              : updating ? <><p className="hub-test"><span className="unit-led is-load" aria-hidden="true" />Update mode · bootloader {identity!.firmware}</p><p className="hub-empty">The pedal is in update mode: Install base flashes it. Unplug it and plug it in normally to see its files.</p></>
              : onBase || identity?.midistomp ? <><p className="hub-test"><span className="unit-led is-on" aria-hidden="true" />{identity?.midistomp ? 'MIDISTOMP ' + identity.midistomp.version : ZOOM_BASE.name}</p><p className="hub-empty">The base, by Luca Matturro. Zoom’s 2.10 updater puts Zoom’s firmware back.</p>
                {identity?.midistomp && <><h3>What it adds</h3><p className="hub-empty">{identity.midistomp.features.join(' · ')}</p></>}</>
              : <><p className="hub-test"><span className="unit-led is-off" aria-hidden="true" />Zoom’s firmware {identity?.firmware || 'unknown'}</p><p className="hub-empty">{canBase ? 'Effect files work on it. The base adds routing on two buses, PERFORM and a looper.' : 'Effect files work on it.'}</p></>}
          </section>
          <section className="hub-cell hub-cell-unit" aria-labelledby="zoom-onit-title">
            <div className="hub-cell-head"><h3 id="zoom-onit-title">On your pedal{files && <> · {effects.length}</>}</h3>
              {files && <span><button type="button" className="text-button" disabled={busy} onClick={read}>Read again</button>
                <label className={'text-button zoom-pick' + (busy || !writable ? ' is-disabled' : '')} title={readOnly}><input type="file" accept=".zdl,.ZDL" hidden disabled={busy || !writable} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) install(file) }} />Install a .ZDL</label></span>}</div>
            {error && <p role="alert" className="hub-error">{error}</p>}
            {changed && <p role="status" className="hub-cell-note">{changed.text}{changed.list && <> <a className="text-button" href={changed.list.url} download={changed.list.name}>Save the effect list from before</a></>}</p>}
            {files ? <>
              <ul className="hub-unit-modules zoom-files">{effects.map(f => <li key={f.name}><span className="unit-led is-on" aria-hidden="true" /><strong>{f.name}</strong><small>{f.effect?.version ?? ''} · {kb(f.size)}{isAddedEffect(f.effect) && <button type="button" className="text-button" disabled={busy || !writable} title={readOnly} onClick={() => uninstall(f)}>Remove</button>}</small></li>)}</ul>
              <p className="hub-cell-note">{count(effects.length - captures.length, 'effect', 'effects')}{captures.length ? <> · {count(captures.length, 'capture or cab', 'captures and cabs')}</> : null}{free !== undefined && <> · {kb(free)} free</>}. <strong>Two added effects must never share an effect ID</strong>: swapping one for another with the same ID has frozen a pedal at boot, and recovering it needed a ROM programmer. Installing refuses the IDs it knows about but can’t see what the pedal had before, so back up all files first.</p>
            </> : <p className="hub-empty">{!connected ? 'Connect your pedal to see what’s on it.' : updating ? 'Plug it in normally to see its files.' : other ? '' : busy ? 'Reading what’s on it…' : 'Not read yet.'}</p>}
            {connected && !files && !updating && !other && !busy && <button type="button" className="text-button" onClick={read}>Read the pedal</button>}
          </section>
        </div>)}
        {panel('backups', <>
          <h2 className="hub-view-title">Backups</h2>
          {error && <p role="alert" className="hub-error">{error}</p>}
          <section className="hub-section" aria-labelledby="zoom-backup-title">
            <h3 id="zoom-backup-title">Back up all files</h3>
            <p>Reads every file on the pedal, checks each block, and saves them in one zip with the effect list’s order: what to restore from if anything goes wrong. Nothing is written to the pedal. Patches are backed up separately, by SysEx.</p>
            <button type="button" className="button button-primary" disabled={!connected || busy} onClick={save}><Icon name="download" size={16} />Back up all files</button>
            {backup && <p><a className="button button-quiet" href={backup.url} download={backup.name}>Save {backup.name}</a> · {backup.files} files</p>}
          </section>
        </>)}
        {panel('setup', <>
          <h2 className="hub-view-title">Setup</h2>
          {error && <p role="alert" className="hub-error">{error}</p>}
          <section className="hub-section" aria-labelledby="zoom-firmware-title">
            <h3 id="zoom-firmware-title">Firmware</h3>
            <p>{connected ? <>Your {model} runs firmware <b>{identity?.firmware || 'unknown'}</b>.</> : 'Connect your pedal to see its firmware.'} Effects here are tested on the MS-70CDR with Zoom’s firmware 2.10.</p>
            <table className="zoom-firmware">
              <caption>Two routes, as on the Octatrack: effect files on Zoom’s firmware, or a base underneath them.</caption>
              <thead><tr><th scope="col">Route</th><th scope="col">What you get</th><th scope="col">State</th></tr></thead>
              <tbody>
                <tr><th scope="row">Zoom’s firmware (2.10) with effect files</th><td>Zoom’s pedal as it is, plus effects, NAM captures and cabs added as files. No reflash: remove a file to undo it.</td><td>Works today.</td></tr>
                <tr><th scope="row"><a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a> as the base, by Luca Matturro</th><td>The firmware underneath, like the Octatrack’s base: routing on two buses, PERFORM mode, a looper, metering, a DSP limit of 300, and the shared tempo and transport the effects use. Built from your own Zoom updater and flashed through Modwerk.</td><td>{!canBase ? 'Coming. Until then, use MIDISTOMP’s own updater.' : onBase ? 'Installed.' : 'Beta: install it below.'} Zoom’s 2.10 updater goes back.</td></tr>
              </tbody>
            </table>
            {device.id !== 'zoom-ms-70cdr' && <p>This page doesn’t flash this pedal’s firmware yet. Back up all files first (Backups).</p>}
          </section>
          {canBase && <section className="hub-section" aria-labelledby="zoom-base-title">
            <h3 id="zoom-base-title">The Modwerk base</h3>
            <p>{onBase ? <>Your {model} runs {ZOOM_BASE.name}. Zoom’s 2.10 updater puts Zoom’s firmware back.</> : <>{ZOOM_BASE.name}, built in your browser from Zoom’s own updater and flashed once over USB. Your effects stay.</>}</p>
            <button type="button" className={'button ' + (onBase ? 'button-quiet' : 'button-primary')} disabled={busy || status === 'unsupported'} onClick={onInstall}>{onBase ? 'Install again' : 'Install the base'}</button>
          </section>}
          <section className="hub-section" aria-labelledby="zoom-connect-title">
            <h3 id="zoom-connect-title">Can’t connect?</h3>
            <p>Use Chrome or Edge on a computer, and allow MIDI with SysEx when the browser asks. Safari and Firefox can’t talk to the pedal.</p>
            <p><strong>In use by another app:</strong> close Zoom Effect Manager and other editors, then connect again.</p>
          </section>
        </>)}
        {sets && panel('set', selected ? <>
          <HubSetHead set={selected} kicker={'Module set · ' + count(selected.moduleIds.length, 'effect', 'effects')} onSetAction={onSetAction!} actions={SET_ACTIONS} />
          <div className="hub-sync" role="group" aria-label="Module set sync">
            <p>{!connected ? 'Connect your pedal to sync this set.' : updating ? 'The pedal is in update mode: plug it in normally to sync this set.'
              : !plan ? busy ? 'Reading what’s on your pedal…' : <>Read the pedal to see what a sync does. <button type="button" className="text-button" onClick={read}>Read the pedal</button></>
              : syncing ? <><strong>{syncing.what} · {syncing.step} of {syncing.steps}</strong>{progress && <> · {progress.label}{progress.total ? <> {progress.done} of {progress.total}</> : '…'}</>}<br />Don’t unplug or touch the pedal until it’s done.</>
              : plan.install.length || plan.remove.length ? <>Installs {plan.install.length} · Removes {plan.remove.length}{free !== undefined && <> · {plan.adds > 0 && <>needs {Math.ceil(plan.adds / 1024)} KB of </>}{kb(free)} free</>}{!fits && <><br />Not enough space on your {model}: take effects out of the set, or remove effects you added by hand.</>}</>
              : selected.moduleIds.length ? <span className="hub-insync"><span className="unit-led is-on" aria-hidden="true" />Already on your {model}{free !== undefined && <> · {kb(free)} free</>}</span> : 'No effects in this set.'}</p>
            <button type="button" className="button button-primary" disabled={!plan || busy || !writable || !fits || (!plan.install.length && !plan.remove.length)} title={readOnly} onClick={sync}><Icon name="download" size={16} />Sync to {model}</button>
          </div>
          {error && <p role="alert" className="hub-error">{error}</p>}
          {changed && <p role="status" className="hub-cell-note">{changed.text}{changed.list && <> <a className="text-button" href={changed.list.url} download={changed.list.name}>Save the effect list from before</a></>}</p>}
          <ModuleGrid ids={selected.moduleIds} inventory={plan && { moduleIds: [...plan.keep, ...plan.remove].map(effect => effect.id), removedStockFx: [] }} describe={id => listed.find(effect => effect.id === id)?.presentation.summary ?? ''}
            module={id => { const effect = listed.find(item => item.id === id); return effect && { name: effect.name, preview: <ZoomEffectPreview effect={effect} compact />, href: deviceHref(effect.machine, 'module/' + effect.id) } }}
            onRemove={id => onToggle?.(id)} onKeep={id => onToggle?.(id)} add={{ href: deviceHref(device.id), label: 'Add effects' }} />
        </> : <div className="hub-empty-set"><h2 className="hub-view-title">No module sets yet</h2><p>Start one, then add effects from the library.</p><button type="button" className="button button-primary" onClick={onNew}><Icon name="plus" size={16} />New module set</button></div>)}
      </div>
    </div>
  </div>
}
