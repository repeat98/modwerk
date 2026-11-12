import type { ReactNode } from 'react'
import { useState, useSyncExternalStore } from 'react'
import { useCommunity } from './context'
import { LoginPromptDialog } from './LoginPromptDialog'
import { Icon } from '../components/Icon'
/** Guests who skip the prompt build without an account until the page reloads. */
let skipped=false
const listeners=new Set<()=>void>()
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
/** The firmware build gate's rule, one for everything that flashes (the card build below, the base install guide's
 * download and USB update): a verified member with a username passes; anyone else meets the sign-in prompt
 * (LoginPromptDialog), which a guest may skip, once for the page. */
export function useBuildGate() {
  const { session } = useCommunity(), skip = useSyncExternalStore(subscribe, () => skipped, () => false)
  return { passed: skip || !!(session.user?.verified && session.user.username), skip() { skipped = true; listeners.forEach(listener => listener()) } }
}
export function MemberGate({ children, action, next }: { children?: ReactNode; action: string; next: string }) {
  const gate = useBuildGate()
  const [open,setOpen]=useState(false)
  if (gate.passed) return children
  return <>
    <section className="build-section member-gate" aria-labelledby="build-access-title">
      <div>
        <h2 id="build-access-title">Build firmware</h2>
        <p>Your files stay on this device.</p>
      </div>
      <div className="build-actions">
        <button className="button button-primary" aria-haspopup="dialog" onClick={()=>setOpen(true)}><Icon name="sliders" size={16}/>{action[0].toUpperCase()+action.slice(1)}</button>
      </div>
    </section>
    {open&&<LoginPromptDialog next={next} onClose={()=>setOpen(false)} onSkip={gate.skip}/>}
  </>
}
