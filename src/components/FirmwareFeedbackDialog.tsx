import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DownloadedBuild } from '../community/hardware-feedback'
import { Icon } from './Icon'
import './firmware-feedback.css'

type Props = {
  build: DownloadedBuild
  onConfirm: (ids: string[]) => Promise<void>
  onReport: (id: string) => void
  onLater: () => void
  onClose: () => void
  inline?: boolean
}

/** A prototype of the post-download check-in. Callers supply the feedback actions. */
export function FirmwareFeedbackDialog({ build, onConfirm, onReport, onLater, onClose, inline = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), description = useId(), submitting = useRef(false)
  const [reported, setReported] = useState<string[]>([]), [savingId, setSavingId] = useState(''), [error, setError] = useState('')
  const busy = !!savingId
  useEffect(() => {
    if (inline) return
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [inline])
  async function confirm(id: string) {
    if (submitting.current || reported.includes(id)) return
    submitting.current = true; setSavingId(id); setError('')
    try { await onConfirm([id]); setReported(current => [...current, id]) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save your feedback. Please try again.') }
    finally { submitting.current = false; setSavingId('') }
  }
  const content = <>
    <div className="firmware-feedback-topline"><span className="firmware-feedback-kicker"><Icon name="wave" size={16}/>AFTER YOUR DOWNLOAD</span><button type="button" className="icon-button" aria-label="Close firmware check-in" disabled={busy} autoFocus={!inline} onClick={onClose}><Icon name="close" size={18}/></button></div>
    <h2 id={heading}>Tried it on your {build.machine}?</h2>
    <p id={description} className="firmware-feedback-intro">Let others know how it went. Your downloaded versions are already attached.</p>
    <p className="firmware-feedback-build">YOUR DOWNLOAD <span>{build.machine} · OS {build.os}</span></p>
    <ul className="firmware-feedback-modules">{build.modules.map(module => {
      const saved = reported.includes(module.id)
      return <li className="firmware-feedback-module" key={module.id}>
        <div className="firmware-feedback-module-name"><strong>{module.name}</strong><small>{module.version}</small>{saved && <span className="firmware-feedback-saved" role="status"><Icon name="check" size={15}/>Reported working</span>}</div>
        <div className="firmware-feedback-module-actions">
          <button type="button" className={'button module-works-action ' + (saved ? 'module-works-reported' : 'button-quiet')} disabled={busy || saved} aria-label={module.name + (saved ? ': reported working' : ': works for me')} onClick={() => void confirm(module.id)}><Icon name={saved ? 'check' : 'plus'} size={16}/>{saved ? 'Reported working' : savingId === module.id ? 'Saving…' : 'Works for me'}</button>
          <button type="button" className="button button-quiet module-issue-action" disabled={busy} aria-label={'Report an issue with ' + module.name} onClick={() => onReport(module.id)}><Icon name="message" size={16}/>Report an issue</button>
        </div>
      </li>
    })}</ul>
    <p className="firmware-feedback-help">Only confirm modules you’ve tested. “Works for me” saves in one click. No forum post.</p>
    {build.machine === 'Octatrack' ? <OctatrackInstallSteps/> : <p className="firmware-feedback-help">Still need to install it? <a href="#faq" onClick={onClose}>Open the flashing guide <Icon name="arrow" size={13}/></a></p>}
    {error && <p className="file-error" role="alert">{error}</p>}
    <div className="firmware-feedback-footer"><button type="button" className="text-button" disabled={busy} onClick={onLater}>Not yet — remind me tomorrow</button><button type="button" className="text-button" disabled={busy} onClick={onClose}>Done for now</button></div>
  </>
  return inline ? <section className="app-dialog firmware-feedback-dialog firmware-feedback-inline" aria-labelledby={heading} aria-describedby={description}>{content}</section> : createPortal(<dialog ref={dialog} className="app-dialog firmware-feedback-dialog" aria-labelledby={heading} aria-describedby={description} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>{content}</dialog>, document.body)
}

function OctatrackInstallSteps() {
  return <details className="firmware-feedback-install"><summary><Icon name="help" size={16}/><span>Still need to install it?</span><Icon name="arrow" size={15}/></summary><div>
    <p>Back up your projects, banks and samples first. Keep your original OS file.</p>
    <ol>
      <li><strong>Connect by USB.</strong><span>On the Octatrack, open <kbd>PROJECT</kbd> → SYSTEM → USB DISK MODE and press YES.</span></li>
      <li><strong>Copy the .bin to the card’s root.</strong><span>The root is the top level of the CompactFlash card, outside every folder.</span><div className="firmware-feedback-card"><span>CompactFlash card</span><code><Icon name="file" size={14}/>your-firmware.bin<span>← put it here</span></code><span className="firmware-feedback-card-folder">AUDIO /</span><span className="firmware-feedback-card-folder">Your set /</span></div></li>
      <li><strong>Eject, then upgrade.</strong><span>Safely eject the drive on your computer and leave USB DISK MODE. Open PROJECT → SYSTEM → OS UPGRADE and confirm with YES.</span></li>
      <li><strong>Wait for startup to finish.</strong><span>Keep power connected until the update and startup finish, or the device asks you to restart. Confirm the OS version, then create and open a fresh project to test your modules.</span></li>
    </ol>
    <p className="firmware-feedback-manuals">Official instructions: <a href="https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf" target="_blank" rel="noreferrer">MKII manual ↗</a> · <a href="https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-User-Manual_ENG-OS1.40A_220204.pdf" target="_blank" rel="noreferrer">MKI manual ↗</a></p>
  </div></details>
}
