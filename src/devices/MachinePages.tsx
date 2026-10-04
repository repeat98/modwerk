import { DigiIssueReport } from '../community/DigiIssueReport'
import { ModuleCommunity } from '../community/ModuleCommunity'
import { useRef, useState, type ReactNode } from 'react'
import { downloadDigiSelection, parseDigiSelection } from '../config/digi-selection'
import { DIGI_DOWNLOADS_ENABLED } from '../engine/elekloader/protocol'
import { Icon } from '../components/Icon'
import { issueRepository } from '../community/report-context'
import type { Configuration } from '../config/workspace'
import { LIBRARY_CATEGORY_LABELS, STANDALONE_NOTE, type FirmwareModule, type ModuleCategory } from '../catalog/modules'
import { DETAILS } from '../catalog/details'
import { AVAILABLE_MODULES } from '../catalog/availability'
import type { SelectionConflict } from '../catalog/selection-conflicts'
import { ModuleCard } from '../components/ModuleCard'
import { LibraryTools } from '../components/LibraryTools'
import { compareModules, downloadCoverage, type ModuleStatistics } from '../community/module-statistics'
import { ModulePopularity } from '../community/ModulePopularity'
import { DeviceImage, PhotoCredit } from './DeviceImage'
import { DEVICES, DEVICES_BY_ID, DEVICE_STEPS, STATUS_LABELS, deviceHref, deviceTitle, stepsDone, type DeviceProfile } from './registry'
import { DIGI_CORES, DIGI_MODS, categorySlug, estimateCombination, type DigiMod } from './digi-mods'
import { MemberGate } from '../community/MemberGate'
import { useDigiFirmware } from '../hooks/useDigiFirmware'
import { DigiFirmwarePanel } from '../components/DigiFirmwarePanel'
import { DigiBuildPanel } from '../components/DigiBuildPanel'

type DigiDevice = DeviceProfile & { id: DigiMod['device'] }
const STEP_LABELS = { done: 'Done', started: 'Started', open: 'Open' } as const

function kib(bytes: number) { return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KiB' }

// Cover art drawn from the mod's kind, in the library's existing preview style.
export function DigiModPreview({ mod, compact = false }: { mod: DigiMod; compact?: boolean }) {
  const kind = categorySlug(mod.category)
  return (
    <div className={'module-preview ' + (compact ? 'compact-preview' : '')} data-module={'digi-' + kind} aria-hidden="true">
      <div className="preview-label"><span>{mod.title}</span><span className="preview-led" /></div>
      <svg viewBox="0 0 320 192" className="signal-art" fill="none">
        <g className="signal-grid">{[52, 97, 142].map(y => <path key={y} d={'M20 ' + y + 'H300'} />)}{[64, 128, 192, 256].map(x => <path key={x} d={'M' + x + ' 33V163'} />)}</g>
        {kind === 'sampling' && <g>
          {Array.from({ length: 64 }, (_, i) => { const h = (Math.abs(Math.sin(i * 1.7 + mod.id.length)) * 38 + 6) * Math.exp(-(i % 16) / 9); return <path key={i} className={i % 16 < 3 ? 'signal-main' : 'signal-secondary'} d={'M' + (30 + i * 4.1) + ' ' + (97 - h) + 'v' + h * 2} /> })}
          {[30, 95.6, 161.2, 226.8].map(x => <path key={x} className="signal-ghost" d={'M' + x + ' 40V154'} strokeDasharray="3 5" />)}
          <text x="25" y="177">SLICES</text>
        </g>}
        {kind === 'synthesis' && <g>
          <path className="signal-ghost" d={Array.from({ length: 121 }, (_, i) => (i ? 'L' : 'M') + (28 + i * 2.2).toFixed(1) + ' ' + (97 + Math.sin(i / 7) * 46).toFixed(1)).join(' ')} />
          <path className="signal-main" d={Array.from({ length: 121 }, (_, i) => (i ? 'L' : 'M') + (28 + i * 2.2).toFixed(1) + ' ' + (97 + Math.sin(i / 5 + Math.sin(i / 3) * 2.2) * 34 * Math.exp(-i / 90)).toFixed(1)).join(' ')} />
          <text x="25" y="177">OP A → OP B</text>
        </g>}
        {kind === 'performance' && <g>
          {[0.62, 0.38, 0.81, 0.27].map((level, i) => <g key={i}><path className="signal-ghost" d={'M' + (58 + i * 62) + ' 150V44'} /><path className="signal-main" d={'M' + (58 + i * 62) + ' 150V' + (150 - level * 106)} strokeWidth="9" /></g>)}
          <text x="25" y="177">CPU · DSP · RAM · DRIVE</text>
        </g>}
      </svg>
    </div>
  )
}

function DigiModCard({ mod, selected, compared, canCompare, onToggle, onCompare }: { mod: DigiMod; selected: boolean; compared: boolean; canCompare: boolean; onToggle: () => void; onCompare: () => void }) {
  const href = deviceHref(mod.device, 'module/' + mod.id)
  return <article className={'module-card ' + (selected ? 'is-selected' : '')}>
    <a href={href} className="module-cover" aria-label={'View ' + mod.title}><DigiModPreview mod={mod} /><div className="hover-info"><span>{mod.summary}</span><strong>Explore module <Icon name="arrow" size={15} /></strong></div>{selected && <span className="selected-badge" aria-label="Selected"><Icon name="check" size={12} /></span>}</a>
    <div className="module-card-body">
      <div className="module-card-title"><div className="module-card-heading"><a href={href}>{mod.title}</a><div className="card-release"><span className="card-version">v{mod.version}</span></div></div><button className={'add-button ' + (selected ? 'is-added' : '')} aria-label={(selected ? 'Remove ' : 'Add ') + mod.title + (selected ? ' from configuration' : ' to configuration')} aria-pressed={selected} onClick={onToggle}><Icon name={selected ? 'check' : 'plus'} size={15} /><span>{selected ? 'Added' : 'Add'}</span></button></div>
      <div className="card-credit"><a href={mod.repository} target="_blank" rel="noreferrer">{mod.author}</a><span>{mod.license}</span></div>
      <div className="card-description">{mod.summary}</div>
      <div className="card-bottom"><span>{mod.category}</span><span>{kib(mod.ramBytes)} memory</span></div>
      <ModulePopularity />
      <div className="card-proof"><span>{mod.hardware ? 'Author-tested on hardware' : 'Author release, not yet tested in Modwerk'}</span><label><input type="checkbox" checked={compared} disabled={!canCompare} onChange={onCompare} />Compare<span className="sr-only"> {mod.title} for {DEVICES_BY_ID[mod.device].name}</span></label></div>
    </div>
  </article>
}

// All machines: every mod in one library, grouped by machine. Adding a mod puts it in that machine's configuration.
type AllMachinesLibraryProps = {
  query: string
  category?: ModuleCategory
  octatrackModules: readonly FirmwareModule[]
  octatrackSelected: string[]
  onToggleOctatrack: (id: string) => void
  digiSelected: Record<DigiMod['device'], string[]>
  onToggleDigi: (device: DigiMod['device'], id: string) => void
  family: string
  onFamilyChange: (value: string) => void
  sort: string
  onSortChange: (value: string) => void
  statistics: readonly ModuleStatistics[] | null
  octatrackConflicts: readonly SelectionConflict[]
  comparison: readonly string[]
  onCompare: (id: string) => void
  onOpenComparison: () => void
  viewedModuleVersions: Record<string, string>
  moduleBaseline: readonly string[] | null
}

export function AllMachinesLibrary({ query, category, octatrackModules: octatrack, octatrackSelected, onToggleOctatrack, digiSelected, onToggleDigi, family, onFamilyChange, sort, onSortChange, statistics, octatrackConflicts, comparison, onCompare, onOpenComparison, viewedModuleVersions, moduleBaseline }: AllMachinesLibraryProps) {
  const term = query.toLowerCase().trim()
  const digi = (device: DigiMod['device']) => DIGI_MODS.filter(mod => mod.device === device && (!category || mod.libraryCategory === category) && (family === 'all' || mod.category === family) && (mod.title + ' ' + mod.summary + ' ' + mod.author).toLowerCase().includes(term))
    .sort((a,b)=>compareModules({id:a.id,name:a.title,authorName:a.author},{id:b.id,name:b.title,authorName:b.author},sort,null))
  const families = Array.from(new Set([...AVAILABLE_MODULES.map(module=>DETAILS[module.id].family), ...DIGI_MODS.map(mod=>mod.category)]))
  // Check the whole saved selection even when search or category filters hide its modules.
  const warnings = [
    ...(octatrackConflicts.length ? [{device: DEVICES_BY_ID.octatrack, description: 'Some modules cannot run together. Choose a compatible set in your configuration.'}] : []),
    ...(['digitakt', 'digitone'] as const).flatMap(id => {
      const estimate = estimateCombination(id, digiSelected[id])
      return !estimate.fits || estimate.clashes.length ? [{device: DEVICES_BY_ID[id], description: !estimate.fits ? 'The selected mods need more memory than this machine shares with mods.' : 'The selected mods cannot be used together.'}] : []
    }),
  ]
  const groups: { device: DeviceProfile; count: number; cards: ReactNode[] }[] = [
    { device: DEVICES_BY_ID.octatrack, count: octatrack.length, cards: octatrack.map(module => <ModuleCard key={module.id} module={module} selected={octatrackSelected.includes(module.id)} statistics={statistics?.find(item=>item.module_id===module.id)} viewedVersion={viewedModuleVersions[module.id]} baseline={moduleBaseline} compared={comparison.includes(module.id)} canCompare={comparison.length<3||comparison.includes(module.id)} onToggle={() => onToggleOctatrack(module.id)} onCompare={()=>onCompare(module.id)} />) },
    ...(['digitakt', 'digitone'] as const).map(id => ({ device: DEVICES_BY_ID[id], count: digi(id).length, cards: digi(id).map(mod => <DigiModCard key={mod.id} mod={mod} selected={digiSelected[id].includes(mod.id)} onToggle={() => onToggleDigi(id, mod.id)} compared={comparison.includes(id+'-'+mod.id)} canCompare={comparison.length<3||comparison.includes(id+'-'+mod.id)} onCompare={()=>onCompare(id+'-'+mod.id)} />) })),
  ]
  const total = groups.reduce((sum, group) => sum + group.count, 0)
  return (
    <div className="library-page">
      <div className="page-heading"><div><p className="page-kicker">MODWERK / ALL MACHINES</p><h1>{category ? LIBRARY_CATEGORY_LABELS[category] : 'All mods'}</h1><p>{category === 'standalone' ? STANDALONE_NOTE : 'Mods for every Elektron machine Modwerk supports. Adding a mod puts it in that machine’s configuration.'}</p></div><span className="library-total">{total} modules</span></div>
      {warnings.map(warning=><a key={warning.device.id} className="selection-conflict-link" href={deviceHref(warning.device.id,'configuration')}><Icon name="sliders" size={18}/><span><strong>{warning.device.name}: your selection needs a change</strong><small>{warning.description}</small></span><Icon name="arrow" size={18}/></a>)}
      <LibraryTools family={family} families={families} onFamilyChange={onFamilyChange} sort={sort} onSortChange={onSortChange} comparisonCount={comparison.length} onCompare={onOpenComparison} buildLabel="Build firmware for Octatrack" />
      {groups.filter(group => group.count).map(group => <section key={group.device.id} className="machine-section" aria-labelledby={'machine-' + group.device.id}>
        <div className="library-subheading"><span id={'machine-' + group.device.id}>{group.device.name} <span className="subtle">· {group.count} {group.count === 1 ? 'module' : 'modules'}{group.device.status === 'preview' ? ' · preview' : ''}</span></span><div className="machine-library-actions"><a className="text-button" href={deviceHref(group.device.id)}>Open {group.device.name} library <Icon name="arrow" size={13} /></a>{group.device.id !== 'octatrack' && <a className="button button-primary" href={deviceHref(group.device.id,'configuration')} aria-label={'Build firmware for ' + group.device.name}><Icon name="sliders" size={16}/>Build firmware</a>}</div></div>
        <div className="module-grid">{group.cards}</div>
      </section>)}
      <p className="popularity-note">{statistics ? downloadCoverage(statistics[0]?.downloadsStarted) : 'Popularity counts are currently unavailable.'} Digitakt and Digitone counts are not available yet.</p>
      {!total && (term || family !== 'all' ? <div className="no-results"><Icon name="search" size={30} /><h2>No modules found</h2><p>Try another name, type or author.</p></div> : <div className="no-results"><Icon name={category === 'standalone' ? 'lock' : 'grid'} size={30} /><h2>No {category ? LIBRARY_CATEGORY_LABELS[category].toLowerCase() : 'mods'} yet</h2><p>Be the first to publish one: every machine follows the same SDK.</p><a className="button button-quiet" href={issueRepository() + '/blob/main/docs/SDK.md'} target="_blank" rel="noreferrer">Read the SDK guide</a></div>)}
      <section className="machine-section"><div className="library-subheading"><span>No mods yet</span><span className="subtle">Help open the next machine</span></div>
        <div className="machine-chips">{DEVICES.filter(device => device.status === 'research' || device.status === 'open').map(device => <a key={device.id} href={deviceHref(device.id)} className={'machine-chip is-' + device.status}>{device.name}{device.variants && <small> {device.variants.join(' · ')}</small>}</a>)}</div>
      </section>
    </div>
  )
}

export function DigiLibrary({ device, category, query, selectedIds, onToggle, family, onFamilyChange, sort, onSortChange, comparison, onCompare, onOpenComparison }: { device: DigiDevice; category?: string; query: string; selectedIds: string[]; onToggle: (id: string) => void; family: string; onFamilyChange: (value: string) => void; sort: string; onSortChange: (value: string) => void; comparison: readonly string[]; onCompare: (id: string) => void; onOpenComparison: () => void }) {
  const all = DIGI_MODS.filter(mod => mod.device === device.id)
  const label = category ? LIBRARY_CATEGORY_LABELS[category as ModuleCategory] : undefined
  const term = query.toLowerCase().trim()
  const families = Array.from(new Set(all.map(mod=>mod.category)))
  const libraryFamily = families.includes(family) ? family : 'all'
  const mods = all.filter(mod => (!category || mod.libraryCategory === category) && (libraryFamily==='all'||mod.category===libraryFamily) && (mod.title + ' ' + mod.summary + ' ' + mod.author).toLowerCase().includes(term))
    .sort((a,b)=>compareModules({id:a.id,name:a.title,authorName:a.author},{id:b.id,name:b.title,authorName:b.author},sort,null))
  const estimate = estimateCombination(device.id, selectedIds)
  return (
    <div className="library-page">
      <div className="page-heading"><div><p className="page-kicker">MODWERK / {device.name.toUpperCase()}</p><h1>{label ?? 'Module library'}</h1><p>{category === 'standalone' ? STANDALONE_NOTE : device.summary}</p></div><span className="library-total">{mods.length} modules</span></div>
      <p className="device-preview-note"><Icon name={DIGI_DOWNLOADS_ENABLED ? "file" : "lock"} size={14} />{DIGI_DOWNLOADS_ENABLED ? <>Build {device.name} firmware locally with your original OS file.</> : <>Preview: check and build {device.name} firmware in your browser. Downloads open after review.</>}</p>
      {(!estimate.fits || estimate.clashes.length > 0) && <a className="selection-conflict-link" href={deviceHref(device.id, 'configuration')}><Icon name="sliders" size={18} /><span><strong>Your selection needs a change</strong><small>{estimate.fits ? 'The selected mods cannot be used together.' : 'The selected mods need more memory than the ' + device.name + ' shares with mods.'}</small></span><Icon name="arrow" size={18} /></a>}
      <LibraryTools family={libraryFamily} families={families} onFamilyChange={onFamilyChange} sort={sort} onSortChange={onSortChange} comparisonCount={comparison.length} onCompare={onOpenComparison} buildHref={deviceHref(device.id,'configuration')} buildLabel={'Build firmware for '+device.name} />
      <div className="library-subheading"><span>{term ? 'Results for “' + query.trim() + '”' : 'Explore the collection'}</span><span className="subtle">{device.name} · OS {device.firmware?.releases.join(' / ')}</span></div>
      <div className="module-grid">{mods.map(mod => <DigiModCard key={mod.id} mod={mod} selected={selectedIds.includes(mod.id)} onToggle={() => onToggle(mod.id)} compared={comparison.includes(device.id+'-'+mod.id)} canCompare={comparison.length<3||comparison.includes(device.id+'-'+mod.id)} onCompare={()=>onCompare(device.id+'-'+mod.id)} />)}</div>
      <p className="popularity-note">Popularity counts and addition dates are not available yet. These sorts use name order until counts are available.</p>
      {!mods.length && <div className="no-results"><Icon name="search" size={30} /><h2>{term || libraryFamily!=='all' ? 'No modules found' : 'No ' + device.name + ' modules here yet'}</h2><p>{term || libraryFamily!=='all' ? 'Try another name, type or author.' : 'Browse all ' + device.name + ' modules, or help write the first one.'}</p><a className="button button-quiet" href={deviceHref(device.id)}>All {device.name} modules</a></div>}
      <div className="library-note"><span className="status-dot" /><p>Built from each author’s pinned public release, with credit and licence.</p></div>
    </div>
  )
}

export function DigiModDetail({ device, mod, selected, onToggle }: { device: DigiDevice; mod: DigiMod; selected: boolean; onToggle: () => void }) {
  const core = DIGI_CORES[device.id]
  const others = DIGI_MODS.filter(other => other.device === device.id && other.id !== mod.id)
  return (
    <div className="detail-page">
      <div className="module-page-actions"><a className="back-link" href={deviceHref(device.id)}><Icon name="back" size={15} /> All {device.name} modules</a></div>
      <section className="detail-hero" aria-labelledby="module-title">
        <DigiModPreview mod={mod} />
        <div className="detail-intro">
          <div className="detail-tags"><span className="pill">{mod.category}</span><span className="subtle">v{mod.version} · {mod.license}</span></div>
          <h1 id="module-title">{mod.title}</h1>
          <a className="author-link" href={mod.repository} target="_blank" rel="noreferrer">by {mod.author} ↗</a>
          <p>{mod.summary}</p>
          <button className={'button ' + (selected ? 'button-added' : 'button-primary')} onClick={onToggle} aria-pressed={selected}><Icon name={selected ? 'check' : 'plus'} size={16} />{selected ? 'Added to configuration' : 'Add to configuration'}</button>
        </div>
      </section>
      <section className="detail-section"><h2>Resources</h2>
        <dl className="device-facts"><dt>Memory</dt><dd>{kib(mod.ramBytes)} of the {kib(core.areaBytes)} all mods share ({kib(core.ramBytes)} reserved for the core and alignment)</dd><dt>Claims</dt><dd>{mod.claims.join(', ')}</dd><dt>Source</dt><dd><a className="author-link" href={mod.repository} target="_blank" rel="noreferrer">{mod.repository.replace('https://github.com/', '')} ↗</a></dd><dt>Hardware</dt><dd>{mod.hardware ?? 'No hardware report yet.'}</dd></dl>
      </section>
      {others.length > 0 && <section className="detail-section"><h2>Combines with</h2>
        <ul className="feature-list">{others.map(other => {
          const estimate = estimateCombination(device.id, [mod.id, other.id])
          const ok = estimate.fits && !estimate.clashes.length
          return <li key={other.id}><Icon name={ok ? 'check' : 'close'} size={15} /><a href={deviceHref(device.id, 'module/' + other.id)}>{other.title}</a><span className="subtle">{ok ? 'fits together (' + kib(estimate.usedBytes) + ')' : estimate.fits ? 'cannot be used together' : 'too large together (' + kib(estimate.usedBytes) + ')'}</span></li>
        })}</ul>
        <p className="combination-footnote">Estimated from code and data sizes. The build’s own check decides.</p>
      </section>}
      <section className="detail-section"><h2>Support & discussion</h2><a className="text-button" href={'#forum?machine='+device.id+'&module='+device.id+'-'+mod.id}>Discuss this module →</a></section>
      <DigiIssueReport id={device.id+'-'+mod.id}/>
      <ModuleCommunity id={device.id+'-'+mod.id} mode="discussion"/>
    </div>
  )
}

export function DigiConfiguration({ device, configuration, configurations, onSelect, onDialog, onToggle, onImport }: { device: DigiDevice; configuration?: Configuration; configurations: Configuration[]; onSelect: (id: string) => void; onDialog: (mode: 'create' | 'rename' | 'duplicate' | 'delete') => void; onToggle: (id: string) => void; onImport: (configuration: ReturnType<typeof parseDigiSelection>) => void }) {
  const importRef = useRef<HTMLInputElement>(null), [importError, setImportError] = useState(''), [exported, setExported] = useState('')
  const firmware = useDigiFirmware(device.id)
  const ids = configuration?.moduleIds ?? []
  const selection = DIGI_MODS.filter(mod => mod.device === device.id && ids.includes(mod.id))
  const estimate = estimateCombination(device.id, ids, firmware.firmware?.release)
  const percent = Math.min(100, estimate.usedBytes / estimate.areaBytes * 100)
  const exportKey = JSON.stringify(configuration)
  async function importBackup(file?: File) {
    if (!file) return
    setImportError('')
    try { if (file.size > 32 * 1024) throw new Error('Configuration backups must be smaller than 32 KB.'); onImport(parseDigiSelection(await file.text(), device.id)) }
    catch(error) { setImportError(error instanceof Error ? error.message : 'Unable to import this configuration.') }
  }
  return (
    <div className="configuration-page">
      <div className="page-heading"><div><p className="page-kicker">YOUR WORKSPACE · {device.name.toUpperCase()}</p><h1>{configuration?.name ?? 'No ' + device.name + ' configuration yet'}</h1><p>Changes save automatically on this device.</p></div><span className="pill">OS {device.firmware?.releases.join(' / ')}</span></div>
      <div className="configuration-actions">
        {configurations.length > 0 && <select aria-label="Choose configuration" value={configuration?.id ?? ''} onChange={event => onSelect(event.target.value)}>{configurations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <button className="button button-primary" onClick={() => onDialog('create')}><Icon name="plus" size={16} />New</button>
        {configuration && <><button className="button button-quiet" onClick={() => onDialog('rename')}>Rename</button><button className="button button-quiet" onClick={() => onDialog('duplicate')}>Duplicate</button><button className="button button-quiet" onClick={() => onDialog('delete')}>Delete</button><button className="button button-quiet" onClick={() => importRef.current?.click()}>Import JSON</button><a className="button button-quiet" href={'#forum/new?category=configs&machine='+device.id}>Share in forum</a></>}
      </div>
      <input ref={importRef} type="file" accept="application/json,.json" hidden aria-label="Import configuration backup" onChange={event => { void importBackup(event.target.files?.[0]); event.target.value = '' }}/>
      {importError && <p className="file-error" role="alert">{importError}</p>}
      <section className={'compatibility-panel compatibility-' + (estimate.fits && !estimate.clashes.length ? 'clear' : 'conflict')} aria-live="polite" aria-labelledby="digi-compatibility-title"><div className="compatibility-heading"><span className="compatibility-icon"><Icon name={estimate.fits && !estimate.clashes.length ? 'shield' : 'sliders'} size={20}/></span><div><h2 id="digi-compatibility-title">{!estimate.fits || estimate.clashes.length ? 'Your selection needs a change' : selection.length ? 'No declared conflicts' : 'Choose your modules'}</h2><p>{!estimate.fits || estimate.clashes.length ? 'Review the resources below and choose a compatible set.' : selection.length ? 'Choose your base firmware for placement checks.' : 'Add a module from the library, or build the core alone. Compatibility updates as you make changes.'}</p></div></div></section>
      <section className="configuration-section" aria-labelledby="digi-firmware-title"><div className="section-title"><h2 id="digi-firmware-title">Base firmware</h2><span className="subtle">Read locally</span></div>
        <DigiFirmwarePanel name={device.name} releases={device.firmware?.releases ?? []} firmware={firmware} />
      </section>
      <section className="configuration-section" aria-labelledby="digi-selection-title"><div className="section-title"><h2 id="digi-selection-title">Selected modules <span className="subtle">{selection.length}</span></h2><a className="text-button" href={deviceHref(device.id)}>Browse modules <Icon name="plus" size={14} /></a></div>
        {selection.length ? <ul className="selected-list">{selection.map(mod => <li key={mod.id}><a className="selected-module-link" href={deviceHref(device.id, 'module/' + mod.id)}><DigiModPreview mod={mod} compact /><span><strong>{mod.title}</strong><small>{mod.category} · {mod.author} · {kib(mod.ramBytes)}</small></span></a><button className="icon-button" aria-label={'Remove ' + mod.title} onClick={() => onToggle(mod.id)}><Icon name="close" size={17} /></button></li>)}</ul>
          : <div className="selection-empty"><Icon name="grid" size={26} /><strong>No modules selected</strong><p>Find something in the library and add it to your configuration.</p><a className="button button-quiet" href={deviceHref(device.id)}>Browse modules</a></div>}
      </section>
      <section className="configuration-section" aria-labelledby="digi-resources-title"><div className="section-title"><h2 id="digi-resources-title">Resources</h2><span className="subtle">core {DIGI_CORES[device.id].version} · {DIGI_CORES[device.id].slots}</span></div>
        <div className={'resource-meter' + (estimate.fits ? '' : ' is-over')} role="meter" aria-valuemin={0} aria-valuemax={estimate.areaBytes} aria-valuenow={estimate.usedBytes} aria-label="Shared mod memory">
          <div className="resource-meter-head"><strong>Shared mod memory</strong><span>{kib(estimate.usedBytes)} of {kib(estimate.areaBytes)}</span></div>
          <div className="resource-meter-track"><span style={{ width: percent + '%' }} /></div>
          <small>{estimate.fits ? 'Estimated from each mod’s code and data sizes; the build’s own check decides.' : 'Over the shared area: this set will not link. Remove a mod.'}</small>
        </div>
        {estimate.clashes.map((clash, index) => <p key={clash.claim + index} className="file-error" role="alert">{clash.mods.join(' and ')} cannot be used together: {clash.claim}.</p>)}
      </section>
      <MemberGate action="build firmware" next={device.id+'/configuration'}><DigiBuildPanel device={device} firmware={firmware} moduleIds={ids} onExport={() => { if (configuration) { downloadDigiSelection(configuration, device.id); setExported(exportKey) } }} exported={exported===exportKey} canExport={!!configuration}/></MemberGate>
    </div>
  )
}

function Hero({ device, children }: { device: DeviceProfile; children?: ReactNode }) {
  return (
    <header className={'device-hero is-' + device.status}>
      <div className="device-hero-media"><div className="device-hero-art" role="img" aria-label={deviceTitle(device)}><DeviceImage device={device} /></div><PhotoCredit device={device} /></div>
      <div className="device-hero-copy">
        <p className="page-kicker">MODWERK / {device.name.toUpperCase()}</p>
        <h1>{device.name}{device.variants && <span className="device-variants"> {device.variants.join(' · ')}</span>}</h1>
        <p>{device.summary}</p>
        <div className="device-hero-meta"><span className={'device-status is-' + device.status}>{STATUS_LABELS[device.status]}</span></div>
        {children}
      </div>
    </header>
  )
}

function PendingDigitaktIiFirmware({ device }: { device: DeviceProfile }) {
  const firmware = useDigiFirmware('digitakt-ii')
  return <section className="configuration-section" aria-labelledby="pending-firmware-title">
    <div className="section-title"><h2 id="pending-firmware-title">Base firmware</h2><span className="subtle">Read locally</span></div>
    <DigiFirmwarePanel name={device.name} releases={device.firmware?.releases ?? []} firmware={firmware} />
    <p className="combination-footnote">Firmware builds and downloads will open after the first mod is qualified and reviewed.</p>
  </section>
}

// Machines without mods: the library page becomes an invitation to open the first one.
export function EmptyMachine({ device }: { device: DeviceProfile }) {
  const repository = issueRepository()
  return (
    <div className="device-page">
      <Hero device={device}><div className="device-hero-actions"><a className="button button-primary" href={repository + '/blob/main/docs/ADD_A_MACHINE.md'} target="_blank" rel="noreferrer"><Icon name="plus" size={16} />Open a device PR</a><a className="button button-quiet" href="#forum"><Icon name="message" size={16} />Discuss in the forum</a></div></Hero>
      {device.id === 'digitakt-ii' ? <>
        <section className="device-invite"><h2>Perform Direct is in review</h2><p>Press PRESET to toggle Perform Kit; hold FUNC and press PRESET to open the PRESET/KIT menu. The author reports it working on a Digitakt II. Modwerk’s release is being prepared.</p></section>
        <PendingDigitaktIiFirmware device={device} />
      </> : <section className="device-invite"><h2>Be the first to mod the {device.name}</h2><p>Nobody has published a working mod for this machine yet. Modwerk never hosts firmware: every build starts from the stock OS file each owner downloads from Elektron, so the work is in understanding that file and sharing only your own code.</p></section>}
      <section className="configuration-section" aria-labelledby="ladder-title">
        <div className="section-title"><h2 id="ladder-title">Road to the first mod</h2><span className="subtle">{stepsDone(device)} of {DEVICE_STEPS.length} done</span></div>
        <ol className="device-ladder">{DEVICE_STEPS.map((step, index) => { const state = device.steps[step.id]; return <li key={step.id} className={'is-' + state}><span className="device-ladder-marker">{state === 'done' ? <Icon name="check" size={14} /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.description}</small></span><span className={'device-step-state is-' + state}>{STEP_LABELS[state]}</span></li> })}</ol>
      </section>
      {device.research?.length ? <section className="configuration-section" aria-labelledby="research-title"><div className="section-title"><h2 id="research-title">Public research</h2><span className="subtle">Credit to its authors</span></div><ul className="device-research">{device.research.map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><Icon name="arrow" size={13} /></a><p>{item.note}</p></li>)}</ul></section> : null}
      <section className="configuration-section" aria-labelledby="start-title"><div className="section-title"><h2 id="start-title">How to start</h2></div>
        <ol className="device-start">
          <li><strong>Study the stock OS file</strong><p>Work from your own download of the newest OS. Record hashes and structure, never the file’s contents.</p></li>
          <li><strong>Propose a device profile</strong><p>Open a PR with <code>sdk/machines/{device.id}/machine.json</code>: OS releases and hashes, file format, flashing and recovery steps.</p></li>
          <li><strong>Build a core, then a first mod</strong><p>A core reserves memory and shares hooks so mods combine. Your first mod ships with documentation and test evidence.</p></li>
        </ol>
      </section>
      <aside className="risk-note"><strong>Never attach firmware</strong><p>Do not put OS files, memory dumps or extracted Elektron code in a PR, issue or forum post. Share hashes, notes and your own source only.</p></aside>
    </div>
  )
}
