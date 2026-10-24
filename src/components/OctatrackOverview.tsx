import { useState } from 'react'
import { MODULES } from '../catalog/modules'
import { lastInventory, sameModules, SAVED_BY_ANOTHER_BASE, type Inventory } from '../config/inventory'
import { syncHistory, type SyncRecord } from '../config/octatrack-progress'
import type { Configuration } from '../config/workspace'
import type { DiagnosticReading } from '../community/octatrack-diagnostics-contract'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { SELFTEST_FAILURES } from '../engine/elekloader/selftest'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { OctatrackLoad } from './OctatrackLoad'
import { MissingNote, type ProjectNeeds } from './OctatrackUpdate'

const modules = (n: number) => n + (n === 1 ? ' module' : ' modules')
const BUSY = ['sending', 'testing', 'trial', 'finishing']
const percent = (value: number) => (value / 10).toFixed(0) + '%'
const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const OUTCOME: Record<SyncRecord['outcome'], [string, string]> = { kept: ['Kept', 'on'], undone: ['Undone', 'off'], failed: ['Failed', 'leaving'] }

/** What the card holds, from the self-test record (modset.c: 7 saved and read back, 1 restored at startup, 8 failed, 4 another base's). */
function cardLine(health: DiagnosticReading) {
  return health.saved === 7 ? { text: `Saved and checked · ${modules(health.savedCount)}`, led: 'on' } : health.saved === 1 ? { text: `Restored at startup · ${modules(health.savedCount)}`, led: 'on' }
    : health.saved === 8 ? { text: 'Saving failed. The modules run until you switch the Octatrack off.', led: 'leaving' }
    : health.saved === SAVED_BY_ANOTHER_BASE ? { text: 'Saved by another base, so not loaded. Sync your modules again.', led: 'leaving' } : { text: 'Nothing saved on it yet', led: 'off' }
}
/** The last self-test in words: its result and the first reason it failed. */
function selftestLine(health: DiagnosticReading) {
  const reason = SELFTEST_FAILURES.find((_, bit) => health.failed & 1 << bit)
  return health.state === 2 ? { text: 'Passed', led: 'on', peaks: true } : health.state === 3 ? { text: 'Failed' + (reason ? ': ' + reason : ''), led: 'leaving', peaks: true }
    : health.state === 1 ? { text: 'Running now', led: 'load' } : { text: 'Not run since the Octatrack was switched on', led: 'off' }
}

/**
 * Status: one fixed panel of cells, like a control room's, that never grows with its contents. The load meters, the
 * last five minutes, the last self-test and the card, what is on the unit and this browser's syncs; long lists scroll in
 * their cell. The load is recorded on every page; other unit readings happen only while it shows. Without a unit every cell stays in place, showing what it can.
 */
export function OctatrackOverview({ link, inventory, sets, needs, health, active, selected, onOpen, onSync, onSaveUnit, onReport }: {
  link: OctatrackLink | null; inventory?: Inventory; sets: Configuration[]; needs?: ProjectNeeds; health?: DiagnosticReading | null; active: boolean; selected?: Configuration
  onOpen: (id: string) => void; onSync: (id: string) => void; onSaveUnit: () => void; onReport: (id?: string) => void
}) {
  const state = useOctatrackLink(link), { status, identity } = state
  const connected = !!identity?.canSubmit && status === 'ready', busy = BUSY.includes(status)
  // A self-test started here (a sync's own stress test shows in its dialog); why it couldn’t run, when it couldn’t.
  const testing = status === 'testing' && !state.module, [why, setWhy] = useState<string | null>(null)
  const last = connected || busy ? undefined : lastInventory()
  const unitIds = connected ? inventory?.moduleIds : last?.moduleIds
  const onUnit = sets.find(set => set.moduleIds.length > 0 && !!unitIds && sameModules(set.moduleIds, unitIds))
  const history = active ? syncHistory() : []
  const test = connected && health ? selftestLine(health) : undefined, card = connected && health ? cardLine(health) : undefined
  const unread = !connected ? 'Connect your Octatrack to read it.' : health === undefined ? 'Reading…' : 'This base doesn’t report it.'
  const row = (record: SyncRecord) => { const [label, led] = OUTCOME[record.outcome], set = sets.find(item => item.name === record.name)
    return <li key={record.at + record.name}><span className={'unit-led is-' + led} aria-hidden="true" /><span className="hub-history-name"><strong>{record.name}</strong><small title={record.message}>{label} · {modules(record.modules)}{record.message && <> · {record.message}</>}</small></span>
      <span className="hub-history-end"><time dateTime={record.at}>{when(record.at)}</time>{record.outcome === 'failed' && <button type="button" className="text-button hub-report" aria-haspopup="dialog" onClick={() => onReport(set?.id)}>Report a problem</button>}</span></li> }
  return <>
    {connected && <MissingNote needs={needs} onSync={selected ? () => onSync(selected.id) : undefined} />}
    <div className="hub-console">
      <OctatrackLoad link={link} active={active} />
      <section className="hub-cell hub-cell-health" aria-label="Self-test and card">
        <div className="hub-cell-head"><h3>Last self-test</h3>
          {link && identity?.canSubmit && (connected || testing) && <button type="button" className="text-button" disabled={!connected} onClick={() => { setWhy(null); void link.test().then(setWhy) }}>Run self-test</button>}</div>
        {testing ? <p className="hub-test" role="status"><span className="unit-led is-load" aria-hidden="true" />Running · {Math.round((state.progress ?? 0) * 100)}%</p>
          : test ? <p className="hub-test"><span className={'unit-led is-' + test.led} aria-hidden="true" />{test.text}</p> : <p className="hub-empty">{unread}</p>}
        {why && !testing && <p className="hub-empty" role="alert">{why[0].toUpperCase() + why.slice(1)}.</p>}
        {test?.peaks && health && <dl className="hub-peaks" aria-label="Peaks during the test">{([['CPU', health.cpu], ['DSP tracks 1–4', health.tracks1to4], ['DSP tracks 5–8', health.tracks5to8]] as const).map(([name, value]) =>
          <div key={name}><dt>{name}</dt><dd><meter min={0} max={1000} value={value} aria-label={name + ' peak during the test'} aria-valuetext={percent(value)} />{percent(value)}</dd></div>)}</dl>}
        <h3>On the card</h3>
        {card ? <p className="hub-test"><span className={'unit-led is-' + card.led} aria-hidden="true" />{card.text}</p> : <p className="hub-empty">{unread}</p>}
      </section>
      <section className="hub-cell hub-cell-unit" aria-labelledby="hub-on-title">
        <div className="hub-cell-head"><h3 id="hub-on-title">{connected ? 'On your Octatrack' : 'Last seen on it'}{unitIds && <> · {unitIds.length}</>}</h3>
          {onUnit ? <button type="button" className="text-button" onClick={() => onOpen(onUnit.id)}>= {onUnit.name}</button>
            : connected && !!inventory?.moduleIds.length && <button type="button" className="text-button" onClick={onSaveUnit}>Save as a module set</button>}</div>
        {unitIds?.length ? <ul className="hub-unit-modules">{unitIds.map(id => { const module = MODULES.find(item => item.id === id)
          return <li key={id}><span className={'unit-led is-' + (connected ? 'on' : 'off')} aria-hidden="true" /><strong>{module?.name ?? id}</strong><small>{module?.detail ?? 'Not in the library'}</small></li> })}</ul>
          : <p className="hub-empty">{unitIds ? 'No modules on it.' : connected ? 'Reading what’s on it…' : 'Connect your Octatrack to see what’s on it.'}</p>}
      </section>
      <section className="hub-cell hub-cell-history" aria-labelledby="hub-history-title">
        <div className="hub-cell-head"><h3 id="hub-history-title">Sync history</h3><span className="hub-cell-note">From this browser</span></div>
        {history.length ? <ul className="hub-history">{history.map(row)}</ul> : <p className="hub-empty">No syncs from this browser yet.</p>}
      </section>
    </div>
  </>
}
