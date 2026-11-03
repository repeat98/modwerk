import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DeviceImage } from '../devices/DeviceImage'
import { zoomHubHref, type ZoomHubView } from '../devices/zoom-hub-route'
import type { DeviceProfile } from '../devices/registry'
import type { ZoomFile, ZoomLink } from '../engine/zoom/zoom-link'
import { ZOOM_DEVICE_IDS, effectInfo, installRefusal, isAddedEffect } from '../engine/zoom/zoom-protocol'
import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import { useZoomLink } from '../hooks/useZoomLink'
import { Icon, type IconName } from './Icon'
import './octatrack-link.css'
import './zoom-hub.css'

const VIEWS: { view: ZoomHubView; title: string; icon: IconName }[] = [
  { view: 'status', title: 'Status', icon: 'grid' },
  { view: 'backups', title: 'Backups', icon: 'download' },
  { view: 'setup', title: 'Setup', icon: 'sliders' },
]
const kb = (bytes: number) => Math.round(bytes / 1024) + ' KB'
const isCapture = (name: string) => /^(NAM|C)\d/i.test(name)

/**
 * Your Zoom pedal: the Octatrack page (OctatrackHub.tsx) for a Zoom MultiStomp, beta only. The pedal's own
 * pages on the leading side, the selected one on the trailing side, over the Web MIDI link (zoom-link.ts).
 * It identifies the pedal, lists what's on it, backs it up, and installs or removes added effect files (the link
 * refuses Zoom's own and known ID clashes).
 */
export function ZoomHub({ device, view, link, header }: { device: DeviceProfile; view: ZoomHubView; link: ZoomLink | null; header?: ReactNode }) {
  const mobile = useMobileWorkspace()
  const state = useZoomLink(link), { status, identity, notice, progress } = state
  const connected = status === 'ready' || status === 'reading' || status === 'writing', busy = status === 'reading' || status === 'writing' || status === 'connecting'
  const expected = ZOOM_DEVICE_IDS[device.id], other = connected && identity && expected !== undefined && identity.deviceId !== expected
  const model = identity?.model ?? device.name
  // What was read belongs to the pedal it was read from: gone when that pedal is.
  const pedalKey = connected && identity ? identity.deviceId + ':' + identity.firmware : ''
  const [onPedal, setOnPedal] = useState<{ key: string; files: ZoomFile[]; free?: number }>()
  const files = onPedal && onPedal.key === pedalKey ? onPedal.files : undefined, free = files ? onPedal!.free : undefined
  const [backup, setBackup] = useState<{ url: string; name: string; files: number }>(), [error, setError] = useState<string>()
  useEffect(() => () => { if (backup) URL.revokeObjectURL(backup.url) }, [backup])
  // Work keeps going on the link after the page closes; its result is then dropped.
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const run = (work: () => Promise<void>) => { setError(undefined); work().catch(e => { if (alive.current) setError((e as Error).message) }) }
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
    if (!window.confirm('Install ' + name + ' (version ' + info.version + ', effect ID ' + info.gid + '/' + info.fxid + ', ' + kb(data.length) + ')? No other effect you install, now or later, may share that ID. It is written, read back and added to the pedal’s effect list. Don’t touch the pedal or the cable until it’s done.')) return
    const result = await link.installFile(name, data)
    if (alive.current) setChanged({ text: result.unchanged ? name + ' is already this exact file.' : name + ' installed and read back identical. Power-cycle the pedal to load it.', list: keepList(result.previousList) })
    await read()
  })
  const uninstall = (file: ZoomFile) => run(async () => {
    if (!link || !window.confirm('Remove ' + file.name + ' from the pedal? Patches that use it will show an empty slot.')) return
    const result = await link.removeFile(file.name)
    if (alive.current) setChanged({ text: file.name + ' removed. Power-cycle the pedal.', list: keepList(result.previousList) })
    await read()
  })
  const save = () => run(async () => {
    if (!link) return
    const { files: count, zip } = await link.backup(), stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    if (alive.current) setBackup({ url: URL.createObjectURL(zip), name: device.id + '-backup-' + stamp + '.zip', files: count })
  })

  const line: ReactNode = status === 'unsupported' ? 'This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.'
    : status === 'connecting' ? 'Looking for your pedal…'
    : progress ? <>{progress.label}{progress.total ? <> · {progress.done} of {progress.total}</> : '…'}</>
    : connected ? <>Connected · firmware {identity?.firmware || 'unknown'}{files && <> · {files.length} files on it</>}{free !== undefined && <> · {kb(free)} free</>}</>
    : notice ? notice.text : 'Not connected'
  const action = status === 'idle' ? <button className="button button-quiet" onClick={() => void link?.connect()}>Connect</button> : null
  const led = connected ? 'on' : busy ? 'load' : 'off'
  const panel = (name: ZoomHubView, content: ReactNode) => <section key={name} className={'hub-view hub-view-' + name} hidden={view !== name} aria-label={VIEWS.find(item => item.view === name)!.title}>{content}</section>
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
      </nav>
      <div className="hub-pane">
        {error && <p role="alert" className="hub-error">{error}</p>}
        {panel('status', <>
          <h2 className="hub-view-title">Status</h2>
          <section className="hub-section" aria-labelledby="zoom-onit-title">
            <h3 id="zoom-onit-title">On the pedal</h3>
            {!connected ? <p>Connect your pedal to see what’s on it.</p>
              : !files ? <><p>Reads the pedal’s file list. Nothing is written.</p><button type="button" className="button button-primary" disabled={busy} onClick={read}>Read the pedal</button></>
              : <><p>{effects.length - captures.length} effects{captures.length ? <> · {captures.length} captures and cabs</> : null}{free !== undefined && <> · {kb(free)} free</>}</p>
                <ul className="zoom-files">{effects.map(f => <li key={f.name}><code>{f.name}</code><small>{f.effect?.version ?? ''} · {kb(f.size)}</small>{isAddedEffect(f.effect) && <button type="button" className="text-button" disabled={busy} onClick={() => uninstall(f)}>Remove</button>}</li>)}</ul>
                <button type="button" className="button button-quiet" disabled={busy} onClick={read}>Read again</button></>}
          </section>
          {connected && files && <section className="hub-section" aria-labelledby="zoom-install-title">
            <h3 id="zoom-install-title">Install an effect file</h3>
            <p>An added effect (.ZDL), for example a NAM capture or cab from the NAM + Cab Loader. It’s written, read back and added to the effect list; the list from before is offered for saving. Zoom’s own effects are never changed here.</p>
            <p><strong>Two added effects must never share an effect ID.</strong> Swapping one for another with the same ID has frozen a pedal at boot, and recovering it needed a ROM programmer. This page refuses an ID already on the pedal or known to clash, but it can’t see what the pedal had before. Back up all files first.</p>
            <label className="button button-quiet zoom-pick"><input type="file" accept=".zdl,.ZDL" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) install(file) }} />Choose a .ZDL file</label>
            {changed && <p role="status">{changed.text}{changed.list && <> <a className="text-button" href={changed.list.url} download={changed.list.name}>Save the effect list from before</a></>}</p>}
          </section>}
        </>)}
        {panel('backups', <>
          <h2 className="hub-view-title">Backups</h2>
          <section className="hub-section" aria-labelledby="zoom-backup-title">
            <h3 id="zoom-backup-title">Back up all files</h3>
            <p>Reads every file on the pedal, checks each block, and saves them in one zip with the effect list’s order: what to restore from if anything goes wrong. Nothing is written to the pedal. Patches are backed up separately, by SysEx.</p>
            <button type="button" className="button button-primary" disabled={!connected || busy} onClick={save}><Icon name="download" size={16} />Back up all files</button>
            {backup && <p><a className="button button-quiet" href={backup.url} download={backup.name}>Save {backup.name}</a> · {backup.files} files</p>}
          </section>
        </>)}
        {panel('setup', <>
          <h2 className="hub-view-title">Setup</h2>
          <section className="hub-section" aria-labelledby="zoom-firmware-title">
            <h3 id="zoom-firmware-title">Firmware</h3>
            <p>{connected ? <>Your {model} runs firmware <b>{identity?.firmware || 'unknown'}</b>.</> : 'Connect your pedal to see its firmware.'} Effects here are tested on the MS-70CDR with Zoom’s firmware 2.10.</p>
            <table className="zoom-firmware">
              <caption>Two routes, as on the Octatrack: effect files on Zoom’s firmware, or a base underneath them.</caption>
              <thead><tr><th scope="col">Route</th><th scope="col">What you get</th><th scope="col">State</th></tr></thead>
              <tbody>
                <tr><th scope="row">Zoom’s firmware (2.10) with effect files</th><td>Zoom’s pedal as it is, plus effects, NAM captures and cabs added as files. No reflash: remove a file to undo it.</td><td>Works today.</td></tr>
                <tr><th scope="row"><a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a> as the base, by Luca Matturro</th><td>The firmware underneath, like the Octatrack’s base: routing on two buses, PERFORM mode, a looper, metering, a DSP limit of 300, and the shared tempo and transport the effects use. Built from your own Zoom updater and flashed through Modwerk.</td><td>Coming. Until then, use MIDISTOMP’s own updater; Zoom’s 2.10 updater goes back.</td></tr>
              </tbody>
            </table>
            <p>This page doesn’t flash firmware yet. Back up all files first (Backups).</p>
          </section>
          <section className="hub-section" aria-labelledby="zoom-connect-title">
            <h3 id="zoom-connect-title">Can’t connect?</h3>
            <p>Use Chrome or Edge on a computer, and allow MIDI with SysEx when the browser asks. Safari and Firefox can’t talk to the pedal.</p>
            <p><strong>In use by another app:</strong> close Zoom Effect Manager and other editors, then connect again.</p>
          </section>
        </>)}
      </div>
    </div>
  </div>
}
