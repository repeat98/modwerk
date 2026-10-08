import { useEffect, useRef } from 'react'
import { Icon } from '../components/Icon'

export function ModuleDiscussionDialog({ onPost, onReportIssue, onClose }: { onPost: () => void; onReportIssue: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), report = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    report.current?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  return <dialog ref={dialog} className="app-dialog module-discussion-dialog" aria-labelledby="module-discussion-dialog-title" aria-describedby="module-discussion-dialog-message" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="section-title"><h2 id="module-discussion-dialog-title">Is something not working right?</h2><button type="button" className="icon-button" aria-label="Cancel posting" onClick={onClose}><Icon name="close" size={18}/></button></div>
    <div id="module-discussion-dialog-message"><p>Use the discussion for questions, tips, ideas and feedback. If the module crashes, sounds wrong or doesn’t behave as described, use “Report an issue”: its developers are notified directly and can track the fix.</p><p>Your written draft will be copied into the issue report. Add a title and choose your device; everything else is optional.</p></div>
    <div className="dialog-actions"><button ref={report} type="button" className="button button-quiet module-issue-action" onClick={onReportIssue}><Icon name="message" size={16}/>Report an issue</button><button type="button" className="button button-quiet" onClick={onPost}>Post a discussion instead</button><button type="button" className="text-button" onClick={onClose}>Keep editing</button></div>
  </dialog>
}
