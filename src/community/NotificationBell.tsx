import { useCallback, useEffect, useRef, useState } from 'react'
import { api, onCommunityReconnect, post } from './api'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { NotificationList } from './NotificationList'
import { notificationLines, type NotificationLine } from './notification-text'
import type { BellItem } from './notification-contract'
import { accountHref } from './member-access'
import { noteRemoteSessionDue } from './remote-session-signal'

const POLL_MS = 60000
export function NotificationBell({ next = 'library' }: { next?: string }) {
  const { session } = useCommunity(), member = session.available && !!session.user?.verified
  // Discard the private inbox when signing out or switching accounts.
  return <NotificationBellContent key={member ? session.user!.id : 'signed-out'} member={member} next={next} />
}
function NotificationBellContent({ member, next }: { member: boolean; next: string }) {
  const [unread, setUnread] = useState(0), [open, setOpen] = useState(false), [items, setItems] = useState<BellItem[] | null>(null), [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null)
  const count = useCallback(() => { void api<{ unread: number; remoteSession?: boolean }>('/notifications/unread').then(value => { setUnread(value.unread); noteRemoteSessionDue(value.remoteSession) }).catch(() => {}) }, [])
  useEffect(() => {
    if (!member) return
    count()
    // Poll only while the tab is visible; returning to the tab refreshes at once.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') count() }, POLL_MS)
    const visible = () => { if (document.visibilityState === 'visible') count() }
    document.addEventListener('visibilitychange', visible)
    const reconnected = onCommunityReconnect(count)
    return () => { window.clearInterval(timer); reconnected(); document.removeEventListener('visibilitychange', visible) }
  }, [member, count])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    if (member) void api<{ items: BellItem[]; unread?: number }>('/notifications').then(value => { if (!cancelled) { setItems(value.items); setUnread(value.unread ?? 0) } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'Notifications could not load.') })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { cancelled = true; document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, member])
  function markRead(ids?: string[]) {
    setItems(current => current?.map(item => !ids || ids.includes(item.id) ? { ...item, seen: true } : item) ?? null)
    setUnread(current => ids ? Math.max(0, current - (items?.filter(item => ids.includes(item.id) && !item.seen).length ?? 0)) : 0)
    // Say why a read did not stick instead of quietly restoring the count.
    void post('/notifications', ids ? { ids } : {}, 'PATCH').catch(error => { setError(error instanceof Error ? error.message : 'Notifications could not be marked as read.'); setOpen(true); count() })
  }
  const lines = items ? notificationLines(items) : []
  return <div className="notification-bell" ref={root}>
    <button ref={button} type="button" className="notification-bell-button" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} aria-controls="notification-panel" onClick={() => { setError(''); setOpen(value => !value) }}><Icon name="bell" size={19} />{unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
      <header><div className="notification-heading"><h2>Notifications</h2>{unread > 0 && <span className="notification-new-count">{unread} new</span>}</div>{member && <button type="button" className="text-button" disabled={!items?.some(item => !item.seen)} onClick={() => markRead()}><Icon name="check" size={14} />Mark all read</button>}</header>
      {!member ? <p className="notification-empty"><Icon name="bell" size={18} />Sign in to see your replies, mentions and updates for modules you follow.</p> : error ? <p className="file-error" role="alert">{error}</p> : !items ? <p className="notification-empty" role="status">Loading…</p> : lines.length ? <NotificationList lines={lines} onOpen={(line: NotificationLine) => { if (!line.seen) markRead(line.ids); setOpen(false) }} /> : <p className="notification-empty"><Icon name="check" size={18} /><strong>You're all caught up.</strong>Replies, mentions, likes, bug report status and releases of modules you follow show up here.</p>}
      <footer>{member ? <><a href="#account/activity" onClick={() => setOpen(false)}>All notifications<Icon name="arrow" size={14} /></a><a href="#account/notifications" onClick={() => setOpen(false)}>Email settings</a></> : <><a href={accountHref('login', next)} onClick={() => setOpen(false)}>Sign in</a><a href={accountHref('register', next)} onClick={() => setOpen(false)}>Create account</a></>}</footer>
    </section>}
  </div>
}
