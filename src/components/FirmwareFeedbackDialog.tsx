import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BuiltModule } from '../community/build-follow-up'
import { downloadedModuleGuide, type DownloadedModuleGuide } from '../community/downloaded-module-guide'
import type { DownloadedBuild } from '../community/hardware-feedback'
import { assetUrl } from '../hosting'
import { Icon } from './Icon'
import { AudioPlayer } from './AudioPlayer'
import { ModulePreview } from './ModulePreview'
import { FirmwareScreenshotCarousel } from './FirmwareScreenshotCarousel'
import './firmware-feedback.css'

type Props = {
  build: DownloadedBuild
  onConfirm: (ids: string[]) => Promise<void>
  onReport: (id: string) => void
  onLater: () => void
  onClose: () => void
  inline?: boolean
  pendingIds?: readonly string[]
  issueReportedIds?: readonly string[]
}

/** The downloaded build stays intact while the member explores and tests each module. */
export function FirmwareFeedbackDialog({ build, onConfirm, onReport, onLater, onClose, inline = false, pendingIds, issueReportedIds = [] }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), guidePane = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null), choices = useRef<HTMLUListElement>(null), heading = useId(), description = useId(), submitting = useRef(false)
  const [selectedId, setSelectedId] = useState(build.modules[0]?.id ?? '')
  const [reported, setReported] = useState<string[]>([]), [savingId, setSavingId] = useState(''), [error, setError] = useState('')
  const [install, setInstall] = useState(false), [enlarged, setEnlarged] = useState(false)
  const busy = !!savingId, selected = build.modules.find(module => module.id === selectedId) ?? build.modules[0]
  const next = build.modules[build.modules.findIndex(module => module.id === selected?.id) + 1]
  useEffect(() => {
    const button = [...(choices.current?.querySelectorAll<HTMLButtonElement>('button[data-module]') ?? [])].find(item => item.dataset.module === selectedId)
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])
  useEffect(() => {
    if (inline) return
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [inline])
  function resetScroll() { guidePane.current?.scrollTo(0, 0); body.current?.scrollTo(0, 0) }
  function select(id: string) { setSelectedId(id); setInstall(false); setEnlarged(false); setError(''); resetScroll() }
  async function confirm(id: string) {
    if (submitting.current || reported.includes(id) || pendingIds && !pendingIds.includes(id)) return
    submitting.current = true; setSavingId(id); setError('')
    try { await onConfirm([id]); setReported(current => [...current, id]) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save your feedback. Please try again.') }
    finally { submitting.current = false; setSavingId('') }
  }
  function status(id: string) {
    return reported.includes(id) ? 'Reported working' : issueReportedIds.includes(id) ? 'Issue reported' : pendingIds && !pendingIds.includes(id) ? 'Feedback saved' : ''
  }
  const saved = selected ? status(selected.id) : ''
  const content = <>
    <header className="firmware-feedback-header">
      <div><h2 id={heading}>{build.machine === 'Octatrack' ? 'Inside your .bin' : 'Inside your firmware'}</h2><p id={description} className="firmware-feedback-intro">Flash it, then open a fresh project and try your modules.</p><p className="firmware-feedback-build">{build.machine} · OS {build.os} · {build.modules.length} {build.modules.length === 1 ? 'module' : 'modules'}</p></div>
      <p className="firmware-feedback-header-help">Only confirm modules you’ve tested.</p>
      <button type="button" className="icon-button firmware-feedback-close" aria-label="Close firmware overview" disabled={busy} autoFocus={!inline} onClick={onClose}><Icon name="close" size={21}/></button>
    </header>
    <div ref={body} className="firmware-feedback-body">
      <nav className="firmware-feedback-library" aria-label="Downloaded modules">
        <h3>Your modules</h3>
        <ul ref={choices}>{build.modules.map(module => {
          const guide = downloadedModuleGuide(module), result = status(module.id)
          return <li key={module.id}><button type="button" data-module={module.id} className={'firmware-feedback-choice' + (selected?.id === module.id && !install ? ' is-active' : '')} aria-current={selected?.id === module.id && !install ? 'true' : undefined} aria-label={'How to use ' + module.name} disabled={busy} onClick={() => select(module.id)}>
            <GuideThumbnail module={module} guide={guide}/>
            <span className="firmware-feedback-choice-copy"><strong>{module.name}</strong><small>{module.version}</small>{guide && <span>{guide.summary}</span>}{result && <span className={'firmware-feedback-result' + (result === 'Reported working' ? ' is-working' : '')}><Icon name={result === 'Reported working' ? 'check' : 'message'} size={13}/>{result}</span>}</span>
          </button></li>
        })}</ul>
      </nav>
      <section ref={guidePane} className="firmware-feedback-guide" aria-label={install ? 'Flashing guide' : selected ? 'How to use ' + selected.name : 'Module guide'}>
        {install ? <FirmwareInstallGuide machine={build.machine}/> : selected ? <>
          <ModuleGuide key={selected.id} module={selected} enlarged={enlarged} onEnlarged={setEnlarged}>
          {!enlarged && <div className="firmware-feedback-test-actions">
            <div className="firmware-feedback-module-actions">
              <button type="button" className={'button module-works-action ' + (saved === 'Reported working' ? 'module-works-reported' : 'button-quiet')} disabled={busy || !!saved} aria-label={selected.name + (saved ? ': ' + saved.toLowerCase() : ': works for me')} onClick={() => void confirm(selected.id)}><Icon name={saved === 'Reported working' ? 'check' : 'plus'} size={17}/>{saved || (busy ? 'Saving…' : 'Works for me')}</button>
              <button type="button" className="button button-quiet module-issue-action" disabled={busy} aria-haspopup="dialog" aria-label={'Report an issue with ' + selected.name} onClick={() => onReport(selected.id)}><Icon name="message" size={17}/>Report an issue</button>
            </div>
            <p className="firmware-feedback-help">Only confirm after testing on your {build.machine}. No forum post.</p>
            {error && <p className="file-error" role="alert">{error}</p>}
          </div>}
          </ModuleGuide>
        </> : <p>This download has no modules to show.</p>}
      </section>
    </div>
    {!!reported.length && <span className="sr-only" role="status">Working confirmations saved for {reported.length} {reported.length === 1 ? 'module' : 'modules'}.</span>}
    <footer className="firmware-feedback-footer">
      <button type="button" className="text-button firmware-feedback-flash-toggle" aria-pressed={install} disabled={busy} onClick={() => { setInstall(value => !value); setEnlarged(false); resetScroll() }}><Icon name="file" size={18}/>{install ? 'Back to modules' : 'Flashing guide'}<Icon name="arrow" size={15}/></button>
      <div className="firmware-feedback-footer-actions"><button type="button" className="text-button firmware-feedback-later" disabled={busy} onClick={onLater}>Remind me tomorrow</button><button type="button" className="text-button" disabled={busy} onClick={onClose}>Done for now</button>{next && !install && <button type="button" className="button button-primary firmware-feedback-next" disabled={busy} onClick={() => select(next.id)}>Next: {next.name}<Icon name="arrow" size={17}/></button>}</div>
    </footer>
  </>
  return inline ? <section className="app-dialog firmware-feedback-dialog firmware-feedback-inline" aria-labelledby={heading} aria-describedby={description}>{content}</section> : createPortal(<dialog ref={dialog} className="app-dialog firmware-feedback-dialog" aria-labelledby={heading} aria-describedby={description} onCancel={event => { event.preventDefault(); if (enlarged) setEnlarged(false); else if (!busy) onClose() }}>{content}</dialog>, document.body)
}

function GuideThumbnail({ module, guide }: { module: BuiltModule; guide?: DownloadedModuleGuide }) {
  if (!guide) return <span className="firmware-feedback-no-thumbnail"><Icon name="file" size={25}/></span>
  return <div className="firmware-feedback-thumbnail">{guide.thumbnail ? <img src={guide.thumbnail} alt=""/> : <ModulePreview id={module.id} compact/>}</div>
}

function ModuleGuide({ module, enlarged, onEnlarged, children }: { module: BuiltModule; enlarged: boolean; onEnlarged: (value: boolean) => void; children: ReactNode }) {
  const guide = downloadedModuleGuide(module)
  if (!guide) return <><h3>Try {module.name}</h3><p className="firmware-feedback-unavailable">The usage guide for your downloaded version ({module.version}) isn’t available here. Your feedback will still include that exact version.</p>{children}</>
  return <div className={'firmware-feedback-module-guide' + (enlarged ? ' is-enlarged' : '')}>
    <h3>{enlarged ? module.name + ' screenshots' : 'Try ' + module.name}</h3>
    {!enlarged && <p className="firmware-feedback-summary">{guide.summary}</p>}
    <FirmwareScreenshotCarousel module={module} guide={guide} enlarged={enlarged} onEnlarged={onEnlarged}>
    {!enlarged && <>
      <div className="firmware-feedback-quick-test"><h4>Quick test</h4><ol>{guide.steps.map((step, i) => <li key={i}><span className="firmware-feedback-step-number" aria-hidden="true">{i + 1}</span><div>{step.title && <strong>{step.title}</strong>}<p>{step.text}</p></div></li>)}</ol></div>
      {children}
      {!!guide.access.length && <details className="firmware-feedback-details"><summary>Full setup steps</summary><ol>{guide.access.map((step, i) => <li key={i}>{step}</li>)}</ol></details>}
      {guide.hasQuickTest && <details className="firmware-feedback-details"><summary>Full instructions &amp; more controls</summary><ol>{guide.usage.map((step, i) => <li key={i}>{step}</li>)}</ol></details>}
      {!!guide.audio.length && <details className="firmware-feedback-details"><summary>Audio previews</summary>{guide.audio.map(item => <figure key={item.path}><AudioPlayer src={assetUrl('module-media/' + module.id + '/' + module.version + '/' + item.path)} label={item.caption || module.name + ' audio preview'}/><figcaption>{item.caption}</figcaption></figure>)}</details>}
    </>}
    </FirmwareScreenshotCarousel>
  </div>
}

function FirmwareInstallGuide({ machine }: { machine: string }) {
  return <div className="firmware-feedback-install">
    <h3>Flash your {machine}</h3><p>Back up your projects and samples first. Keep your original OS file.</p>
    {machine === 'Octatrack' ? <ol>
      <li><strong>Connect by USB.</strong><span>Open PROJECT → SYSTEM → USB DISK MODE on the Octatrack and press YES.</span></li>
      <li><strong>Copy the .bin to the card’s root.</strong><span>Use the top level of the CompactFlash card, outside every folder. Check your browser’s downloads folder for the file first.</span></li>
      <li><strong>Eject, then upgrade.</strong><span>Safely eject the drive and leave USB DISK MODE. Open PROJECT → SYSTEM → OS UPGRADE and confirm with YES.</span></li>
      <li><strong>Wait for startup to finish.</strong><span>Keep power connected until the update and startup finish, or the device asks you to restart. Confirm the OS version, then create and open a fresh project to test your modules.</span></li>
    </ol> : <ol>
      <li><strong>Connect by USB.</strong><span>Open Elektron Transfer and select your {machine} as its MIDI input and output, then connect.</span></li>
      <li><strong>Send the .syx.</strong><span>Drop your downloaded firmware onto Transfer’s Drop files here area.</span></li>
      <li><strong>Confirm on the unit.</strong><span>Press YES when prompted. Keep power connected until the upgrade and startup have finished.</span></li>
    </ol>}
  </div>
}
