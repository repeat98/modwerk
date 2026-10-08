import { useState, type ReactNode } from 'react'
import App from '../App'
import { BuildFollowUp } from '../community/BuildFollowUp'
import { builtModules, downloadedReportContext } from '../community/build-follow-up'
import { DigiIssueReport } from '../community/DigiIssueReport'
import { IssueReport } from '../community/IssueReport'
import { ModuleFeedbackPanel } from '../community/ModuleFeedbackPanel'
import { ModuleIssueDialog } from '../community/ModuleIssueDialog'
import { ModuleWorksReportButton } from '../community/ModuleWorksReportButton'
import { FirmwareFeedbackDialog } from './FirmwareFeedbackDialog'
import { Icon } from './Icon'
import { ReportingPreviewContext } from './ReportingPreviewContext'
import '../community/forum.css'
import './reporting-preview.css'

const build = { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapehead']) }
const digi = { machine: 'Digitakt', os: '1.54', modules: builtModules(['digitakt-digihealth']) }

export default function ReportingPreview({ modulePage = false }: { modulePage?: boolean }) {
  return <ReportingPreviewContext>{modulePage ? <App/> : <ReportingComparison/>}</ReportingPreviewContext>
}

function ReportingComparison() {
  const [reporting, setReporting] = useState(''), [revision, setRevision] = useState(0), [notice, setNotice] = useState('')
  return <main className="reporting-preview-page">
    <header className="reporting-preview-heading"><div><p className="page-kicker">LOCAL DESIGN PREVIEW</p><h1>One reporting flow, everywhere.</h1><p>Same wording, colors and short forms. Try every action below — nothing is sent or saved.</p></div><div><button type="button" className="button button-quiet" onClick={() => { setRevision(value => value + 1); setNotice('') }}>Reset previews</button><a className="button button-primary" href="/?preview=firmware-feedback" onClick={event => { event.preventDefault(); window.location.assign(event.currentTarget.href) }}>Try the delayed modal<Icon name="arrow" size={15}/></a><a className="text-button" href="/?preview=reporting-module#module/fm-synth" onClick={event => { event.preventDefault(); window.location.assign(event.currentTarget.href) }}>Open full module page<Icon name="arrow" size={15}/></a></div></header>
    {notice && <p className="reporting-preview-notice" role="status">{notice}</p>}
    <div className="reporting-preview-grid" key={revision}>
      <PreviewPanel number="01" title="Module page" description="One-click feedback beside the working count.">
        <ModuleFeedbackPanel workingCount={2} workingAction={<ModuleWorksReportButton id="miniverb"/>} onReportIssue={() => setReporting('miniverb')}/>
      </PreviewPanel>
      <PreviewPanel number="02" title="After a download" description="Confirm or report each module directly.">
        <BuildFollowUp {...build} preview/>
      </PreviewPanel>
      <PreviewPanel number="03" title="On a return visit" description="Only modules still waiting for feedback.">
        <section className="hardware-feedback-reminder"><div className="section-title"><h2>Tried your Octatrack modules?</h2><button className="icon-button" aria-label="Dismiss reminder preview" onClick={() => setNotice('Preview reminder dismissed.')}><Icon name="close" size={16}/></button></div><BuildFollowUp {...build} pendingIds={['tapehead']} embedded preview/><button className="text-button hardware-feedback-later" onClick={() => setNotice('Preview snoozed until tomorrow. Nothing was scheduled.')}>Not yet — remind me tomorrow</button></section>
      </PreviewPanel>
      <PreviewPanel number="04" title="Delayed check-in modal" description="The same actions, with a flashing guide below.">
        <FirmwareFeedbackDialog build={build} inline onConfirm={async () => { setNotice('Preview working confirmation. Nothing was sent.') }} onReport={setReporting} onLater={() => setNotice('Preview snoozed until tomorrow. Nothing was scheduled.')} onClose={() => setNotice('Preview check-in dismissed.')}/>
      </PreviewPanel>
      <PreviewPanel number="05" title="Octatrack issue form" description="Title, what happened and your model. Build attached.">
        <div className="module-issue-dialog reporting-preview-form"><div className="section-title"><h2>Report an issue · Mini Verb</h2></div><p className="service-note">Your downloaded modules and versions are already attached.</p><IssueReport id="miniverb" author="repeat98" embedded workspaceContext={downloadedReportContext(build)} preview/></div>
      </PreviewPanel>
      <PreviewPanel number="06" title="Digitakt / Digitone issue form" description="Same form, with the matching device and OS.">
        <div className="module-issue-dialog reporting-preview-form"><div className="section-title"><h2>Report an issue · DigiHealth</h2></div><p className="service-note">Your downloaded modules and versions are already attached.</p><DigiIssueReport id="digitakt-digihealth" embedded workspaceContext={downloadedReportContext(digi)} baseOs={digi.os} preview/></div>
      </PreviewPanel>
    </div>
    {reporting && <ModuleIssueDialog id={reporting} build={build} preview onClose={() => setReporting('')}/>}
  </main>
}

function PreviewPanel({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="reporting-preview-panel"><header><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></header><div className="reporting-preview-panel-body">{children}</div></section>
}
