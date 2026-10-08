import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { DigiIssueReport } from './DigiIssueReport'
import { IssueReport } from './IssueReport'
import { communityModule } from './modules'
import type { DownloadedBuild } from './hardware-feedback'
import { downloadedReportContext } from './build-follow-up'

export function ModuleIssueDialog({ id, build, onClose, preview = false, onReported }: { id: string; build: DownloadedBuild; onClose: () => void; preview?: boolean; onReported?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), module = communityModule(id)!
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  const workspace = downloadedReportContext(build)
  return createPortal(<dialog ref={dialog} className="app-dialog module-issue-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="section-title"><h2 id={heading}>Report an issue · {module.name}</h2><button type="button" className="icon-button" aria-label="Close issue report" onClick={onClose}><Icon name="close" size={18}/></button></div>
    <p className="service-note">Tell us what happened. Your downloaded modules and versions are already attached.</p>
    {module.machine === 'octatrack' ? <IssueReport id={id} author={module.author} embedded workspaceContext={workspace} baseOs={build.os} preview={preview} onReported={onReported}/> : <DigiIssueReport id={id} embedded workspaceContext={workspace} baseOs={build.os} moduleVersion={build.modules.find(item => item.id === id)?.version} preview={preview} onReported={onReported}/>}
  </dialog>, document.body)
}
