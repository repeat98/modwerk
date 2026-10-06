import type { ReactNode } from 'react'
import { DETAILS } from '../catalog/details'
import { moduleEvidence, type CardEvidence } from '../catalog/module-evidence'
import type { FirmwareModule } from '../catalog/modules'
import { downloadCoverage, type ModuleStatistics } from '../community/module-statistics'
import { moduleHref } from '../routing'
import { Icon } from './Icon'
import { ModulePreview } from './ModulePreview'
import { ModuleRelease } from './ModuleRelease'

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
}

export function AddButton({ name, selected, onToggle }: { name: string; selected: boolean; onToggle: () => void }) {
  const label = (selected ? 'Remove ' : 'Add ') + name + (selected ? ' from configuration' : ' to configuration')
  return <button className={'add-button ' + (selected ? 'is-added' : '')} aria-label={label} title={label} aria-pressed={selected} onClick={onToggle}><Icon name={selected ? 'check' : 'plus'} size={15} /><span>{selected ? 'Added' : 'Add'}</span></button>
}

// Rating, likes and downloads on one line. An unrated module shows no star; an unavailable count shows a dash so a
// loaded zero stays distinct from a service that did not answer.
export function CardStats({ statistics: stats, children }: { statistics?: ModuleStatistics; children?: ReactNode }) {
  return <div className="card-stats">
    {stats?.count && stats.average !== null ? <span className="card-stat is-rating" title={stats.count + (stats.count === 1 ? ' rating' : ' ratings')}><Icon name="star" size={12} />{stats.average.toFixed(1) + ' (' + stats.count + ')'}</span> : null}
    <span className="card-stat"><Icon name="heart" size={12} />{stats ? stats.likes.toLocaleString() : '—'}<span className="sr-only"> {stats?.likes === 1 ? 'like' : 'likes'}</span></span>
    <span className="card-stat" title={downloadCoverage(stats?.downloadsStarted)}><Icon name="download" size={12} />{stats?.downloads === undefined ? '—' : stats.downloads.toLocaleString()}<span className="sr-only"> {stats?.downloads === 1 ? 'download' : 'downloads'}</span></span>
    {children}
  </div>
}

export function CardProof({ evidence, name, compared, canCompare, onCompare }: { evidence: CardEvidence; name: string; compared: boolean; canCompare: boolean; onCompare: () => void }) {
  return <div className="card-proof">
    <span><span className={'evidence-dot is-' + evidence.level} aria-hidden="true" />{evidence.label}</span>
    <label><input type="checkbox" checked={compared} disabled={!canCompare} onChange={onCompare} />Compare<span className="sr-only"> {name}</span></label>
  </div>
}

export function ModuleCard({ module, selected, statistics, viewedVersion, baseline, compared, canCompare, onToggle, onCompare }: ModuleCardProps) {
  return <article className={'module-card ' + (selected ? 'is-selected' : '')}>
    <a href={moduleHref(module.id)} className="module-cover" aria-label={'View ' + module.name}>
      <ModulePreview id={module.id} />
      <div className="hover-info"><span>{module.description}</span><strong>Explore module <Icon name="arrow" size={15} /></strong></div>
      {selected && <span className="selected-badge" aria-label="Selected"><Icon name="check" size={12} /></span>}
    </a>
    <div className="module-card-body">
      <div className="module-card-title">
        <div className="module-card-heading"><a href={moduleHref(module.id)}>{module.name}</a><ModuleRelease module={module} viewedVersion={viewedVersion} baseline={baseline} /></div>
        <AddButton name={module.name} selected={selected} onToggle={onToggle} />
      </div>
      <div className="card-meta"><span><a href={module.authorUrl} target="_blank" rel="noreferrer">{module.authorName}</a></span><span>{module.detail}</span><span>{DETAILS[module.id].family}</span></div>
      <p className="card-description">{module.description}</p>
      <CardStats statistics={statistics} />
      <CardProof evidence={moduleEvidence(module.id)} name={module.name} compared={compared} canCompare={canCompare} onCompare={onCompare} />
    </div>
  </article>
}
