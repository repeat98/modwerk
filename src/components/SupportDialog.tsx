import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { trackUsage } from '../community/usage'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'

export function SupportButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="support-link" aria-haspopup="dialog" onClick={onClick}><span className="support-heart"><Icon name="heart" size={14} /></span>Support Modwerk</button>
}

export function SupportDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    trackUsage('support_opened') // Only the event name is sent, like every other count.
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return <dialog ref={dialog} className="app-dialog support-dialog" aria-labelledby="support-title" aria-describedby="support-message" onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id="support-title"><span className="support-heart"><Icon name="heart" size={20} /></span>Contribute to Modwerk</h2>
    <p id="support-message">Modwerk grew out of octabam and the work of people who build, test and share modules for their instruments.</p>
    <ul className="support-ways">
      <li><a href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the Discord</a> to trade ideas, ask questions or help someone get a module running.</li>
      <li><a href="#forum" onClick={onClose}>Share a test or bug report in the forum.</a> Include the machine, OS version and what you heard or saw.</li>
      <li><a href="#submit" onClick={onClose}>Contribute code.</a> The guide covers building a module and submitting your changes for review.</li>
    </ul>
    <p>I cover the hosting and storage bills. If you’d like to help with those costs, Ko-fi tips are welcome. Modwerk is free to use.</p>
    <div className="dialog-actions">
      <button type="button" className="button button-quiet" autoFocus onClick={onClose}>Close</button>
      <a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => trackUsage('support_link_opened')} aria-label="Support on Ko-fi (opens in a new tab)">Support on Ko-fi <span aria-hidden="true">↗</span></a>
    </div>
  </dialog>
}
