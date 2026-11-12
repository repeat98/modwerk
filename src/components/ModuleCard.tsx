import { useRef, useState, type ReactNode, type Ref } from 'react'
import { isBetaModule } from '../catalog/availability'
import type { AddBlock } from '../catalog/add-blocks'
import { DETAILS } from '../catalog/details'
import { moduleBuildPending } from '../catalog/build-support'
import { moduleHardwareEvidence } from '../catalog/module-evidence'
import { moduleStability, type ModuleStability } from '../catalog/module-stability'
import type { FirmwareModule } from '../catalog/modules'
import { downloadCoverage, type ModuleStatistics } from '../community/module-statistics'
import { moduleHref } from '../routing'
import { Icon } from './Icon'
import { ModulePreview } from './ModulePreview'
import { ModuleRelease } from './ModuleRelease'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { ModuleWorksCount } from '../community/ModuleWorksCount'
import { ModuleAuthors } from './ModuleAuthors'
import { AddBlockChip, AddBlockPrompt } from './AddBlockPrompt'
import { useAddBlockPrompt } from './use-add-block-prompt'
import { useModuleAudioPreviews } from './audio-preview-context'
import { ModuleAudioCardCover } from './ModuleAudioPreview'
import { useBetaUi, useSetWords } from '../community/beta-ui'
import { cardOnlyDetail, moduleCardOnly } from '../catalog/library-compatibility'
import { MODULE_COMPARE_ENABLED } from './module-compare'

export type ModuleCardProps = {
  module: FirmwareModule
  selected: boolean
  statistics?: ModuleStatistics
  viewedVersion?: string
  baseline: readonly string[] | null
  compared: boolean
  canCompare: boolean
  onToggle: () => void
  onCompare: () => void
  onBrowse?: () => void
  // What adding this module would do to the current configuration; undefined when it fits.
  block?: AddBlock
  onSwap?: (removeIds: readonly string[]) => void
}

export type AddConflict = { block: AddBlock; open: boolean; controls: string; onAsk: () => void }

export function AddButton({ name, selected, onToggle, configure = false, conflict, blocked, ref }: { name: string; selected: boolean; onToggle: () => void; configure?: boolean; conflict?: AddConflict; blocked?: AddBlock; ref?: Ref<HTMLButtonElement> }) {
  const w = useSetWords()
  // A module this member cannot load at all (usb-only) cannot be added; the reason stays readable on the button.
  if (blocked && !selected) return <button ref={ref} className="add-button is-blocked" disabled aria-label={name + ': ' + blocked.reason} title={blocked.detail}><Icon name="lock" size={15} /><span>{blocked.kind === 'limit' ? 'Full' : 'USB only'}</span></button>
  // A conflicting add asks first instead of adding. It stays an enabled button so it can be reached by keyboard and touch.
  if (conflict && !selected) {
    const swappable = !!conflict.block.swapRemoveIds
    const label = name + ': ' + conflict.block.reason + '. ' + (swappable ? 'Choose to swap or add anyway.' : 'Choose how to add it.')
    return <button ref={ref} className="add-button is-conflict" aria-label={label} title={conflict.block.reason} aria-expanded={conflict.open} aria-controls={conflict.controls} onClick={conflict.onAsk}><Icon name="swap" size={15} /><span>{swappable ? 'Swap' : 'Review'}</span></button>
  }
  const label = configure && !selected ? 'Configure ' + name : (selected ? 'Remove ' : 'Add ') + name + (selected ? ' from ' : ' to ') + w.set
  return <button ref={ref} className={'add-button ' + (selected ? 'is-added' : '')} aria-label={label} title={label} aria-pressed={selected} onClick={onToggle}><Icon name={selected ? 'check' : configure ? 'sliders' : 'plus'} size={15} /><span>{selected ? 'Added' : configure ? 'Configure' : 'Add'}</span></button>
}

/** A module only card firmware can carry (moduleCardOnly), marked like a USB-only one, which it can still be added as. */
export function CardOnlyChip({ name }: { name: string }) {
  return <span className="add-block-chip is-card-only" title={cardOnlyDetail(name)}><Icon name="file" size={12} /><span className="add-block-label">Card only</span><span className="sr-only">. {cardOnlyDetail(name)}</span></span>
}

// Working reports, likes and downloads on one line, strongest signal first. An unavailable count shows a dash so a
// loaded zero stays distinct from a service that did not answer.
export function CardStats({ statistics: stats, children }: { statistics?: ModuleStatistics; children?: ReactNode }) {
  return <div className="card-stats">
    <ModuleWorksCount count={stats?.worksReports} compact/>
    <span className="card-stat"><Icon name="heart" size={12} />{stats ? stats.likes.toLocaleString() : '—'}<span className="sr-only"> {stats?.likes === 1 ? 'like' : 'likes'}</span></span>
    <span className="card-stat is-downloads" title={downloadCoverage(stats?.downloadsStarted)}><Icon name="download" size={12} />{stats?.downloads === undefined ? '—' : stats.downloads.toLocaleString()}<span className="sr-only"> {stats?.downloads === 1 ? 'download' : 'downloads'}</span></span>
    {children}
  </div>
}

// The stability grade, explained on hover and to screen readers. Its colour and three-step meter follow the level; a
// confirmed bug shows a warning mark instead of the meter.
export function CardProof({ stability, statistics, name, compared, canCompare, onCompare }: { stability: ModuleStability; statistics?: ModuleStatistics; name: string; compared: boolean; canCompare: boolean; onCompare: () => void }) {
  const waiting = statistics?.needsInfoIssues ?? 0, review = Math.max(0,(statistics?.unconfirmedIssues ?? 0) - waiting)
  const grade = { limited: 'Limited testing', pending: 'Build pending', 'in-use': 'In regular use', proven: 'Widely used', reported: stability.label }[stability.level]
  return <div className="card-proof" data-level={stability.level}>
    <span className="card-proof-grade" title={stability.label + '. ' + stability.detail}>{stability.level === 'reported' ? <Icon name="warn" size={12} /> : <span className="grade-meter" aria-hidden="true"><span /><span /><span /></span>}<span className="card-proof-grade-label">{grade}</span><span className="sr-only">. {stability.detail}</span></span>
    {(review > 0 || waiting > 0) && <span className="card-proof-reports">
      {review > 0 && <span className="card-proof-count is-review" title={review.toLocaleString() + ' unconfirmed ' + (review === 1 ? 'report' : 'reports')}><Icon name="message" size={13} />{review.toLocaleString()}<span className="sr-only"> unconfirmed {review === 1 ? 'report' : 'reports'}</span></span>}
      {waiting > 0 && <span className="card-proof-count is-waiting" title={waiting.toLocaleString() + ' waiting for reporter details'}><Icon name="help" size={13} />{waiting.toLocaleString()}<span className="sr-only"> waiting for reporter details</span></span>}
    </span>}
    {MODULE_COMPARE_ENABLED && <label><input type="checkbox" checked={compared} disabled={!canCompare} onChange={onCompare} />Compare<span className="sr-only"> {name}</span></label>}
  </div>
}

export function ModuleCard({ module, selected, statistics, viewedVersion, baseline, compared, canCompare, onToggle, onCompare, onBrowse, block, onSwap }: ModuleCardProps) {
  const { clips } = useModuleAudioPreviews(module.id)
  const [audioReady, setAudioReady] = useState(false)
  const pending = selected ? undefined : block
  const trigger = useRef<HTMLButtonElement>(null)
  const prompt = useAddBlockPrompt(pending, trigger)
  // With the Octatrack base path, a module without a USB package says so on its card, where "USB only" stands for the
  // modules card firmware can't hold; without it, every module goes on the card anyway.
  const cardOnly = useBetaUi() && moduleCardOnly(module.id)
  return <article className={'module-card ' + (selected ? 'is-selected' : '')}>
    {clips[0] ? <ModuleAudioCardCover id={module.id} name={module.name} href={moduleHref(module.id)} onBrowse={onBrowse} inert={prompt.open} prepare={audioReady} onPrepare={() => setAudioReady(true)} clip={clips[0]}><ModulePreview id={module.id}/></ModuleAudioCardCover> : <a href={moduleHref(module.id)} onClick={onBrowse} onAuxClick={onBrowse} className="module-cover" aria-label={'View ' + module.name} inert={prompt.open}>
      <ModulePreview id={module.id} />
      <div className="hover-info"><span>{module.description}</span><strong>Explore module <Icon name="arrow" size={15} /></strong></div>
    </a>}
    <div className="module-card-body" inert={prompt.open}>
      <div className="module-card-title">
        <div className="module-card-heading"><a href={moduleHref(module.id)} onClick={onBrowse} onAuxClick={onBrowse}>{module.name}</a>{isBetaModule(module.id) && <span className="module-beta-badge">Beta</span>}<ModuleRelease module={module} viewedVersion={viewedVersion} baseline={baseline} /></div>
        <AddButton ref={trigger} name={module.name} selected={selected} onToggle={onToggle} configure={module.id === USB_AUDIO_MODULE} conflict={prompt.conflict && { block: prompt.conflict, open: prompt.open, controls: prompt.id, onAsk: prompt.toggle }} blocked={pending?.kind === 'usb-only' || pending?.kind === 'limit' ? pending : undefined} />
      </div>
      {module.id === USB_AUDIO_MODULE && <span className="module-compatibility-badge module-card-compatibility"><Icon name="wave" size={12} />Outbox 8 compatible</span>}
      <div className="card-credit"><ModuleAuthors name={module.authorName} url={module.authorUrl} contributors={module.contributors}/><span>{module.detail}</span></div>
      <p className="card-description">{module.description}</p>
      <div className="card-bottom">{pending ? <AddBlockChip block={pending} /> : cardOnly ? <CardOnlyChip name={module.name} /> : <span>{DETAILS[module.id].family}</span>}<CardStats statistics={statistics} /></div>
      <CardProof stability={moduleStability(statistics, { buildPending: moduleBuildPending(module.id), hardware: moduleHardwareEvidence(module.id) })} statistics={statistics} name={module.name} compared={compared} canCompare={canCompare} onCompare={onCompare} />
    </div>
    {prompt.conflict && prompt.open && <AddBlockPrompt id={prompt.id} name={module.name} block={prompt.conflict} onCancel={prompt.close}
      onSwap={() => { onSwap?.(prompt.conflict?.swapRemoveIds ?? []); prompt.close() }} onAddAnyway={() => { onToggle(); prompt.close() }} />}
  </article>
}
