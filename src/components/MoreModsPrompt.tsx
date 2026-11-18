import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { developHref } from '../overview/overview'
import type { DeviceProfile } from '../devices/registry'
import './link-hero.css'

// One key per machine: "Not now" or "Get active" on the Digitakt II page leaves the Digitone page free to ask once too.
export const moreModsKey = (device: string) => 'modwerk.more-mods:' + device

const WAYS: [IconName, string, string][] = [
  ['plus', 'Build a mod.', 'Your coding agent writes the code. You bring the idea and try it on your own unit.'],
  ['wave', 'Port one you love.', 'With its author’s OK, a mod from another project can run here beside the others.'],
  ['message', 'Test and tell us.', 'Try the preview mods and report what breaks. That counts too.'],
]

function asked(device: string) {
  try { return localStorage.getItem(moreModsKey(device)) !== null } catch { return false }
}

/** On a machine page whose mods are still in preview (App.tsx), once per machine and browser: an invitation to help
 * grow the library, leading to Start developing with this machine chosen. It waits until the tab is visible and no
 * other dialog is open, so it never stacks on the welcome or the beta prompt. */
export function MoreModsPrompt({ device, count }: { device: DeviceProfile; count?: number }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (asked(device.id)) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) { window.clearInterval(timer); setOpen(true) }
    }, 1500)
    return () => window.clearInterval(timer)
  }, [device.id])
  useEffect(() => {
    const element = dialog.current
    if (!open || !element) return
    element.showModal(); element.querySelector('h2')?.focus()
    return () => element.close()
  }, [open])
  function remember(answer: 'later' | 'active') {
    try { localStorage.setItem(moreModsKey(device.id), answer) } catch { /* Asked again next visit when storage is blocked. */ }
    setOpen(false)
  }
  if (!open) return null
  const so = count ? (count === 1 ? 'one mod' : count + ' mods') + ' so far, all in preview' : 'its first mods, still in preview'
  return <dialog ref={dialog} className="base-install-dialog more-mods" aria-labelledby="more-mods-title" aria-describedby="more-mods-intro" onCancel={event => { event.preventDefault(); remember('later') }}>
    <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={() => remember('later')}><Icon name="close" size={18} /></button>
    <h2 id="more-mods-title" className="link-title" tabIndex={-1}>Want to see more mods here? Get active.</h2>
    <p id="more-mods-intro" className="base-install-intro">The {device.name} has {so}. Every one was made by someone who owns one, and the next can be yours. No need to be an expert.</p>
    <ul className="link-promises">{WAYS.map(([icon, lead, rest]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong> {rest}</span></li>)}</ul>
    <footer className="base-install-footer">
      <div className="base-install-actions">
        <button type="button" className="button button-quiet" onClick={() => remember('later')}>Not now</button>
        <a className="button button-primary" href={developHref(device.id)} onClick={() => remember('active')}>Get active</a>
      </div>
    </footer>
  </dialog>
}
