// A Zoom MultiStomp effect in the library: its card and its page. It goes in a set, which the pedal page syncs to the
// pedal over USB; the file itself is there for Zoom Effect Manager. It is the author's release, pinned and served by the site.
import type { CatalogBrowse } from '../catalog/catalog-browse'
import { moduleStability } from '../catalog/module-stability'
import { Icon } from '../components/Icon'
import { ModuleAuthors } from '../components/ModuleAuthors'
import { AddButton, CardProof, CardStats } from '../components/ModuleCard'
import { ModuleDetailLayout } from '../components/ModuleDetailLayout'
import { ModuleResourceSummary } from '../components/ModuleResourceSummary'
import { ModuleUsageInstructions } from '../components/ModuleUsageInstructions'
import { issueRepository } from '../community/report-context'
import type { ModuleStatistics } from '../community/module-statistics'
import type { MachineProfile } from './machine-contract'
import MACHINES from './machines.generated.json'
import { DEVICES_BY_ID, deviceHref, type DeviceProfile } from './registry'
import { zoomEffectAuthor, zoomEffectRepository, zoomEffectThumbnail, zoomEffectUrl, type ZoomEffect } from './zoom-effects'

const kib = (bytes: number) => (bytes / 1024).toFixed(1) + ' KiB'
const documentUrl = (effect: ZoomEffect, path: string) => issueRepository() + '/blob/main/sdk/zoom/modules/' + effect.id + '/' + path
const budget = (effect: ZoomEffect, name: string) => (MACHINES as MachineProfile[]).find(machine => machine.id === effect.machine)?.sdk?.budgets.find(entry => entry.name === name)?.value
const tested = (effect: ZoomEffect) => effect.platform.pedals.filter(pedal => pedal.status === 'confirmed').map(pedal => DEVICES_BY_ID[pedal.machine].name + ' ' + pedal.firmware)

export function ZoomEffectPreview({ effect, compact = false }: { effect: ZoomEffect; compact?: boolean }) {
  return <div className={'module-preview' + (compact ? ' compact-preview' : '')} data-module="zoom-effect" aria-hidden="true">
    <div className="preview-label"><span>{effect.name}</span><span className="preview-led" /></div>
    <svg viewBox="0 0 320 192" className="signal-art" fill="none"><image className="saved-thumbnail" href={zoomEffectThumbnail(effect)} width="320" height="192" /></svg>
  </div>
}

export function ZoomEffectCard({ effect, selected, onToggle, statistics, compared, canCompare, onCompare, onBrowse }: { effect: ZoomEffect; selected: boolean; onToggle: () => void; statistics?: ModuleStatistics; compared: boolean; canCompare: boolean; onCompare: () => void; onBrowse?: () => void }) {
  const href = deviceHref(effect.machine, 'module/' + effect.id), name = DEVICES_BY_ID[effect.machine].name
  const stability = moduleStability(statistics, { hardware: tested(effect).length ? 'Tested on ' + tested(effect).join(', ') + '.' : '' })
  return <article className={'module-card ' + (selected ? 'is-selected' : '')}>
    <a href={href} onClick={onBrowse} onAuxClick={onBrowse} className="module-cover" aria-label={'View ' + effect.name}><ZoomEffectPreview effect={effect} /><div className="hover-info"><span>{effect.presentation.summary}</span><strong>Explore effect <Icon name="arrow" size={15} /></strong></div></a>
    <div className="module-card-body">
      <div className="module-card-title"><div className="module-card-heading"><a href={href} onClick={onBrowse} onAuxClick={onBrowse}>{effect.name}</a><div className="card-release"><span className="card-version">v{effect.version}</span></div></div><AddButton name={effect.name} selected={selected} onToggle={onToggle} /></div>
      <div className="card-credit"><ModuleAuthors name={zoomEffectAuthor(effect)} url={zoomEffectRepository(effect)} contributors={effect.author.contributors} /><span>{effect.license.spdx}</span></div>
      <p className="card-description">{effect.presentation.summary}</p>
      <div className="card-bottom"><span>{effect.presentation.family}</span><CardStats statistics={statistics}><span className="card-stat">DSP {effect.platform.dspCost}</span></CardStats></div>
      <CardProof stability={stability} statistics={statistics} name={effect.name + ' for ' + name} compared={compared} canCompare={canCompare} onCompare={onCompare} />
    </div>
  </article>
}

function ZoomEffectGuide({ effect, device }: { effect: ZoomEffect; device: DeviceProfile }) {
  const { access, controls, platform } = effect
  return <>
    <details className="module-disclosure">
      <summary><span>About & credits</span><Icon name="plus" size={16} /></summary>
      <div className="disclosure-content">
        <div className="overview-grid">
          <section className="detail-section"><h2>About this effect</h2><p>{effect.presentation.overview}</p><ul className="feature-list">{effect.presentation.highlights.map(item => <li key={item}><Icon name="check" size={15} />{item}</li>)}</ul></section>
          <aside className="info-panel"><h2>Effect information</h2><dl>
            <div><dt>{effect.author.contributors?.length ? 'Authors' : 'Author'}</dt><dd><ModuleAuthors name={zoomEffectAuthor(effect)} url={zoomEffectRepository(effect)} contributors={effect.author.contributors} arrows /></dd></div>
            <div><dt>File on the pedal</dt><dd>{platform.file} · effect ID {platform.effectId.gid}/{platform.effectId.fxid} · v{platform.effectVersion}</dd></div>
            <div><dt>Firmware</dt><dd>{effect.compatibility.releases.join(' / ')}</dd></div>
            <div><dt>Licence</dt><dd><a href={documentUrl(effect, effect.license.file)} target="_blank" rel="noreferrer">{effect.license.spdx}</a></dd></div>
          </dl><a className="source-link" href={platform.binary.release.repository + '/releases/tag/' + encodeURIComponent(platform.binary.release.tag)} target="_blank" rel="noreferrer">Author’s release <Icon name="arrow" size={14} /></a></aside>
        </div>
        <section className="detail-section"><h2>Credits</h2><ul>{effect.author.credits.map(credit => <li key={credit}>{credit}</li>)}</ul></section>
      </div>
    </details>
    <details className="module-disclosure controls-section">
      <summary><span>Controls & defaults{controls.length > 0 && <small>{controls.length} controls</small>}</span><Icon name="plus" size={16} /></summary>
      <div className="disclosure-content"><dl className="control-docs">{controls.map(control => <div key={control.name}><dt>{control.name}<span>{control.default === null ? '—' : control.labels?.[control.default] ?? control.default}</span></dt><dd>{control.doc}</dd></div>)}</dl></div>
    </details>
    <details className="module-disclosure">
      <summary><span>How to use it</span><Icon name="plus" size={16} /></summary>
      <div className="disclosure-content">
        <section className="detail-section module-access"><h2>Find it on your {device.name}</h2>{'location' in access ? <><p>{access.location}</p><ol>{access.steps.map(step => <li key={step}>{step}</li>)}</ol></> : <p>{access.noUiReason}</p>}</section>
        <ModuleUsageInstructions module={{ id: effect.machine + '-' + effect.id, name: effect.name, version: effect.version }} title={effect.tests.documentation?.tutorial.title} steps={effect.presentation.usage} />
        <p>Add it to your set and sync the set from the pedal page, or <a href={zoomEffectUrl(effect)} download={platform.file}>download {platform.file}</a> and install it with Zoom Effect Manager. Power-cycle the pedal afterwards.</p>
        <a href={documentUrl(effect, 'README.md')} target="_blank" rel="noreferrer">Read the complete guide ↗</a>
      </div>
    </details>
    <details className="module-disclosure">
      <summary><span>Pedals, tests & safety</span><Icon name="plus" size={16} /></summary>
      <div className="disclosure-content">
        <section className="detail-section"><h2>Pedals</h2><ul className="feature-list">{platform.pedals.map(pedal => <li key={pedal.machine + pedal.firmware}><Icon name={pedal.status === 'confirmed' ? 'check' : 'help'} size={15} />{DEVICES_BY_ID[pedal.machine].name} {pedal.firmware}<span className="subtle">{pedal.status === 'confirmed' ? 'tested on the pedal' : pedal.status === 'reported' ? 'reported to work' : 'not tested'}</span></li>)}</ul>
          {!!effect.compatibility.limitations.length && <><h3>Compatibility notes</h3><ul>{effect.compatibility.limitations.map(note => <li key={note}>{note}</li>)}</ul></>}</section>
        <section className="quality-note"><h2>Test evidence</h2><p>{effect.tests.summary}</p><p>{effect.evidence.hardware?.summary ?? 'No hardware report yet.'}</p><a href={documentUrl(effect, effect.tests.report)} target="_blank" rel="noreferrer">Test details ↗</a></section>
        <aside className="risk-note"><strong>An added effect · install at your own risk</strong><p>Back up the pedal’s files first (the pedal page, Backups). {device.firmware?.recovery ?? ''}</p></aside>
      </div>
    </details>
  </>
}

export function ZoomEffectDetail({ device, effect, selected, onToggle, browse, onBackToResults }: { device: DeviceProfile; effect: ZoomEffect; selected: boolean; onToggle: () => void; browse?: CatalogBrowse | null; onBackToResults?: () => void }) {
  const id = effect.machine + '-' + effect.id, dsp = budget(effect, 'Patch DSP') ?? 225, size = budget(effect, 'Effect file') ?? effect.platform.binary.bytes
  return <ModuleDetailLayout browse={browse} onBackToResults={onBackToResults} id={id} title={effect.name} family={effect.presentation.family}
    detail={'location' in effect.access ? effect.access.location : effect.access.noUiReason}
    author={zoomEffectAuthor(effect)} authorUrl={zoomEffectRepository(effect)} contributors={effect.author.contributors} description={effect.presentation.summary}
    selected={selected} onToggle={onToggle} backHref={deviceHref(effect.machine)} backLabel={'All ' + device.name + ' effects'}
    preview={<ZoomEffectPreview effect={effect} />}
    resources={<ModuleResourceSummary indicators={[
      { id: 'dsp', label: 'DSP', value: String(effect.platform.dspCost), status: 'Declared', score: effect.platform.dspCost, maximum: dsp, fill: Math.min(100, effect.platform.dspCost / dsp * 100), valueText: effect.platform.dspCost + ' of ' + dsp + ' per patch' },
      { id: 'memory', label: 'File', value: kib(effect.platform.binary.bytes), status: 'Measured', score: effect.platform.binary.bytes, maximum: size, fill: Math.min(100, effect.platform.binary.bytes / size * 100), valueText: kib(effect.platform.binary.bytes) + ' of the ' + kib(size) + ' largest effect proven to load' },
    ]} evidence={<><h3>Resources</h3><p className="resource-evidence-date">v{effect.version}</p><p>{effect.resources.load.display}. {effect.resources.load.conditions}</p></>} />}
    guide={<ZoomEffectGuide effect={effect} device={device} />}
    issueReport={() => <p>Something wrong with {effect.name}? <a href={issueRepository() + '/issues/new?title=' + encodeURIComponent(effect.name + ' (' + device.name + '): ')} target="_blank" rel="noreferrer">Open an issue on GitHub</a>.</p>}
  />
}
