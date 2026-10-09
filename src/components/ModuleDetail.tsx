import type { CatalogBrowse } from '../catalog/catalog-browse'
import { assetUrl } from '../hosting'
import { useState } from 'react'
import { ModuleControls } from './ModuleControls'
import { IssueReport } from '../community/IssueReport'
import type { FirmwareModule } from '../catalog/modules'
import { getModuleSource } from '../catalog/modules'
import { DETAILS } from '../catalog/details'
import { Icon } from './Icon'
import { ModulePreview } from './ModulePreview'
import { ModuleResources } from './ModuleResources'
import { ModuleResourceIndicators } from './ModuleResourceIndicators'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { ModuleDetailLayout } from './ModuleDetailLayout'
import { ModuleAuthors } from './ModuleAuthors'
import { UsbAudioConfigurator } from './UsbAudioConfigurator'
import { USB_AUDIO_MIDI_CREDITS } from './credits'
import { USB_AUDIO_MODULE, usbAudioPreset, type UsbAudioConfiguration } from '../config/usb-audio'

export function ModuleDetail({ module, selected, onToggle, browse, onBackToResults, usbAudio, configurationName, configurationId, onConfigureUsbAudio }: { browse?: CatalogBrowse | null; onBackToResults?: () => void; module: FirmwareModule; selected: boolean; onToggle: () => void; usbAudio?: UsbAudioConfiguration; configurationName?: string; configurationId?: string; onConfigureUsbAudio?: (value: UsbAudioConfiguration | undefined) => void }) {
  const previewKey = configurationId + JSON.stringify(usbAudio)
  const [usbDraft, setUsbDraft] = useState<{ key: string; value: UsbAudioConfiguration }>({ key: previewKey, value: usbAudio ?? usbAudioPreset('outbox') })
  const draft = usbDraft.key === previewKey ? usbDraft.value : usbAudio ?? usbAudioPreset('outbox')
  const details = DETAILS[module.id]
  const moduleDocument = MODULE_DOCUMENTS_BY_ID[module.id]
  return <ModuleDetailLayout browse={browse} onBackToResults={onBackToResults} id={module.id} title={module.name} family={details.family} detail={module.detail}
    titleBadge={module.id === USB_AUDIO_MODULE ? 'Outbox 8 compatible' : undefined}
    configureTarget={module.id === USB_AUDIO_MODULE && onConfigureUsbAudio ? 'usb-setup' : undefined}
    author={module.authorName} authorUrl={module.authorUrl} contributors={module.contributors} description={module.description}
    selected={selected} onToggle={onToggle} backHref="#library" backLabel="All modules"
    preview={<ModulePreview id={module.id} />} resources={<ModuleResourceIndicators id={module.id} usbLayout={module.id === USB_AUDIO_MODULE && onConfigureUsbAudio ? draft.layout : undefined} />}
    notice={moduleDocument.build && <p className="service-note" role="status">{moduleDocument.build.reason}</p>}
    overviewIntro={module.id === USB_AUDIO_MODULE && onConfigureUsbAudio && <UsbAudioConfigurator key={previewKey} draft={draft} onDraftChange={value => setUsbDraft({ key: previewKey, value })} configuration={usbAudio} selected={selected} configurationName={configurationName} onConfigure={onConfigureUsbAudio} />}
    guide={<>
      <details className="module-disclosure">
        <summary><span>About & credits</span><Icon name="plus" size={16} /></summary>
        <div className="disclosure-content">
          <div className="overview-grid">
            <section className="detail-section"><h2>About this module</h2><p>{details.overview}</p><ul className="feature-list">{details.highlights.map(item => <li key={item}><Icon name="check" size={15} />{item}</li>)}</ul></section>
            <aside className="info-panel"><h2>Module information</h2><dl><div><dt>{module.contributors?.length ? 'Authors' : 'Author'}</dt><dd><ModuleAuthors name={module.authorName} url={module.authorUrl} contributors={module.contributors} arrows/></dd></div><div><dt>Location</dt><dd>{module.detail}</dd></div><div><dt>Base firmware</dt><dd>OS 1.40C</dd></div><div><dt>Module version</dt><dd>{module.version}</dd></div><div><dt>Licence</dt><dd><a href={assetUrl('licenses/THIRD_PARTY_NOTICES.html')} target="_blank" rel="noreferrer">{moduleDocument.license.spdx}</a></dd></div><div><dt>Catalog</dt><dd>Experimental</dd></div></dl><a className="source-link" href={getModuleSource(module)} target="_blank" rel="noreferrer">Module source <Icon name="arrow" size={14} /></a></aside>
          </div>
          <section className="detail-section"><h2>Credits</h2>{module.id === USB_AUDIO_MODULE ? <><p>The USB Audio 0.2 setup builds on these USB audio and MIDI contributions.</p><ul>{USB_AUDIO_MIDI_CREDITS.map(credit => <li key={credit.name}><strong>{credit.author}:</strong> {credit.description} <a href={credit.links[1].href} target="_blank" rel="noreferrer">Source &amp; credits ↗</a></li>)}</ul></> : <ul>{moduleDocument.author.credits.map(credit => <li key={credit}>{credit}</li>)}</ul>}</section>
        </div>
      </details>
      <ModuleControls id={module.id} />
      <ModuleResources id={module.id} />
    </>}
    issueReport={openRequest => <IssueReport id={module.id} author={module.author} openRequest={openRequest} />}
  />
}
