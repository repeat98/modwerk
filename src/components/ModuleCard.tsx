import type { ReactNode } from 'react'
import { isBetaModule } from '../catalog/availability'
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
}

export function AddButton({ name, selected, onToggle, configure = false }: { name: string; selected: boolean; onToggle: () => void; configure?: boolean }) {
  const label = configure && !selected ? 'Configure ' + name : (selected ? 'Remove ' : 'Add ') + name + (selected ? ' from configuration' : ' to configuration')
  return <button className={'add-button ' + (selected ? 'is-added' : '')} aria-label={label} title={label} aria-pressed={selected} onClick={onToggle}><Icon name={selected ? 'check' : configure ? 'sliders' : 'plus'} size={15} /><span>{selected ? 'Added' : configure ? 'Configure' : 'Add'}</span></button>
}

// Rating, likes and downloads on one line. An unrated module shows no star; an unavailable count shows a dash so a
// loaded zero stays distinct from a service that did not answer.
export function CardStats({ statistics: stats, children }: { statistics?: ModuleStatistics; children?: ReactNode }) {
  return <div className="card-stats">
    {stats?.count && stats.average !== null ? <span className="card-stat is-rating" title={stats.count + (stats.count === 1 ? ' rating' : ' ratings')}><Icon name="star" size={12} />{stats.average.toFixed(1) + ' (' + stats.count + ')'}</span> : null}
    <span className="card-stat"><Icon name="heart" size={12} />{stats ? stats.likes.toLocaleString() : '—'}<span className="sr-only"> {stats?.likes === 1 ? 'like' : 'likes'}</span></span>
    <span className="card-stat" title={downloadCoverage(stats?.downloadsStarted)}><Icon name="download" size={12} />{stats?.downloads === undefined ? '—' : stats.downloads.toLocaleString()}<span className="sr-only"> {stats?.downloads === 1 ? 'download' : 'downloads'}</span></span>
    <ModuleWorksCount count={stats?.worksReports} compact/>
    {children}
  </div>
}

// The stability grade, explained on hover and to screen readers.
export function CardProof({ stability, name, compared, canCompare, onCompare }: { stability: ModuleStability; name: string; compared: boolean; canCompare: boolean; onCompare: () => void }) {
  return <div className="card-proof">
    <span title={stability.detail}><span className={'evidence-dot is-' + stability.level} aria-hidden="true" />{stability.label}<span className="sr-only">. {stability.detail}</span></span>
    <label><input type="checkbox" checked={compared} disabled={!canCompare} onChange={onCompare} />Compare<span className="sr-only"> {name}</span></label>
  </div>
}

export function ModuleCard({ module, selected, statistics, viewedVersion, baseline, compared, canCompare, onToggle, onCompare, onBrowse }: ModuleCardProps) {
  return <article className={'module-card ' + (selected ? 'is-selected' : '')}>
    <a href={moduleHref(module.id)} onClick={onBrowse} onAuxClick={onBrowse} className="module-cover" aria-label={'View ' + module.name}>
      <ModulePreview id={module.id} />
      <div className="hover-info"><span>{module.description}</span><strong>Explore module <Icon name="arrow" size={15} /></strong></div>
    </a>
    <div className="module-card-body">
      <div className="module-card-title">
        <div className="module-card-heading"><a href={moduleHref(module.id)} onClick={onBrowse} onAuxClick={onBrowse}>{module.name}</a>{isBetaModule(module.id) && <span className="module-beta-badge">Beta</span>}<ModuleRelease module={module} viewedVersion={viewedVersion} baseline={baseline} /></div>
        <AddButton name={module.name} selected={selected} onToggle={onToggle} configure={module.id === USB_AUDIO_MODULE} />
      </div>
      {module.id === USB_AUDIO_MODULE && <span className="module-compatibility-badge module-card-compatibility"><Icon name="wave" size={12} />Outbox 8 compatible</span>}
      <div className="card-credit"><ModuleAuthors name={module.authorName} url={module.authorUrl} contributors={module.contributors}/><span>{module.detail}</span></div>
      <p className="card-description">{module.description}</p>
      <div className="card-bottom"><span>{DETAILS[module.id].family}</span><CardStats statistics={statistics} /></div>
      <CardProof stability={moduleStability(statistics, { buildPending: moduleBuildPending(module.id), hardware: moduleHardwareEvidence(module.id) })} name={module.name} compared={compared} canCompare={canCompare} onCompare={onCompare} />
    </div>
  </article>
}
