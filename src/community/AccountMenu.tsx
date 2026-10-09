import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from '../components/Icon'
import { post } from './api'
import { useCommunity } from './context'
import { ForumAvatar } from './ForumIdentity'

// The sidebar's account row: the member's name opens a menu upwards with their account, workspaces and sign-out.
// Signed out, it is a plain link to sign in. Phones reach the same pages through the app bar's menu.
export function AccountMenu({ route }: { route: string }) {
  const { session, developer, refresh } = useCommunity()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const close = () => setOpen(false)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onPointer = (event: PointerEvent) => { if (!panelRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('hashchange', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => { window.removeEventListener('hashchange', close); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer) }
  }, [open])
  const current = route === 'account' || route.startsWith('account/') || route === 'developer' || route.startsWith('developer/') || route === 'admin' || route === 'review'
  const user = session.user?.verified ? session.user : null
  if (!user) return <div className="sidebar-account"><a className={'sidebar-account-row' + (current ? ' active' : '')} href="#account" aria-current={current ? 'page' : undefined}><span className="sidebar-account-icon"><Icon name="shield" size={16} /></span><span className="sidebar-account-name"><strong>Sign in / register</strong><small>Join the community</small></span></a></div>
  const roles = [session.admin && 'Admin', developer?.user && 'Developer', user.betaTester && 'Beta tester'].filter(Boolean).join(' · ')
  async function signOut() {
    setBusy(true); setError('')
    try { await post('/auth/logout', {}); await refresh(); setOpen(false); window.location.assign('#account/login') }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign out.') }
    finally { setBusy(false) }
  }
  function moveFocus(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
    event.preventDefault()
  }
  return (
    <div className="sidebar-account">
      {open && <div ref={panelRef} id={panelId} className="sidebar-account-menu" role="navigation" aria-label="Account" onKeyDown={moveFocus}>
        <a href="#account" aria-current={route === 'account' || route.startsWith('account/') ? 'page' : undefined}><Icon name="shield" size={16} />Your account</a>
        {user.username && <a href={'#forum/profile/' + encodeURIComponent(user.username)}><Icon name="message" size={16} />Your public profile</a>}
        {developer?.user && <a href="#developer" aria-current={route === 'developer' || route.startsWith('developer/') ? 'page' : undefined}><Icon name="sliders" size={16} />Creator settings</a>}
        {session.admin && <a href="#admin" aria-current={route === 'admin' || route === 'review' ? 'page' : undefined}><Icon name="star" size={16} />Admin workspace</a>}
        <hr />
        <button type="button" disabled={busy} onClick={() => void signOut()}><Icon name="back" size={16} />{busy ? 'Signing out…' : 'Sign out'}</button>
        {error && <p className="sidebar-account-error" role="alert">{error}</p>}
      </div>}
      <button ref={buttonRef} type="button" className={'sidebar-account-row' + (current || open ? ' active' : '')} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}>
        <ForumAvatar username={user.username ?? user.displayName} avatar={user.avatar} />
        <span className="sidebar-account-name"><strong>{user.displayName || '@' + user.username}</strong><small>{roles || (user.username ? '@' + user.username : 'Community member')}</small></span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>
    </div>
  )
}
