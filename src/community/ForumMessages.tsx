import { useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { BackLink } from '../components/BackLink'
import { Icon } from '../components/Icon'
import { MemberPrompt } from './MemberPrompt'
import { ForumAvatar } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import { MESSAGE_MAX_LENGTH } from './forum-contract'

type Conversation = { id: string; updated_at: string; username: string; displayName: string; avatar: string | null; excerpt: string | null; mine: number; unread: number }
type Inbox = { conversations: Conversation[]; enabled: boolean }
type View = { member: { username: string; displayName: string; avatar: string | null }; messages: { id: string; mine: boolean; body: string; hidden: boolean; created_at: string }[]; blocked: boolean; canSend: boolean; hasMore: boolean }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'

function InboxPage() {
  const { session } = useCommunity(), [inbox, setInbox] = useState<Inbox | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const verified = !!session.user?.verified
  useEffect(() => {
    if (!verified) return
    let cancelled = false
    void api<Inbox>('/forum/messages').then(value => { if (!cancelled) setInbox(value) }).catch(error => { if (!cancelled) setError(errorText(error)) })
    return () => { cancelled = true }
  }, [verified])
  async function toggle(enabled: boolean) {
    setBusy(true); setError('')
    try { await post('/forum/messages/settings', { enabled }, 'PATCH'); setInbox(current => current && { ...current, enabled }) } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  return <>
    <BackLink href="#forum">All discussions</BackLink>
    <div className="page-heading forum-heading"><div><span className="forum-eyebrow">Private</span><h1>Messages</h1><p>Conversations between you and one other member. Open a member's profile to start one.</p></div></div>
    <MemberPrompt />
    {verified && (error ? <p className="file-error" role="alert">{error}</p> : !inbox ? <p role="status">Loading messages…</p> : <>
      {inbox.conversations.length ? <ul className="forum-dm-inbox" aria-label="Conversations">{inbox.conversations.map(item => <li key={item.id} data-unread={item.unread > 0 || undefined}>
        <a href={'#forum/messages/' + encodeURIComponent(item.username)}>
          <ForumAvatar username={item.username} avatar={item.avatar} />
          <span className="forum-dm-inbox-copy"><span className="forum-dm-inbox-head"><strong>{item.displayName || '@' + item.username}</strong><ForumTime value={item.updated_at} relative /></span><span className="forum-dm-inbox-excerpt">{item.mine ? 'You: ' : ''}{item.excerpt ?? 'No messages yet.'}</span></span>
          {item.unread > 0 && <span className="forum-dm-unread" aria-label={item.unread + ' unread'}>{item.unread}</span>}
        </a>
      </li>)}</ul> : <div className="forum-empty"><Icon name="mail" size={28} /><h2>No messages yet</h2><p>Open a member's profile and choose “Send a message” to start a conversation.</p><a className="button button-quiet" href="#forum">Browse discussions</a></div>}
      <label className="forum-dm-setting"><input type="checkbox" checked={inbox.enabled} disabled={busy} onChange={event => void toggle(event.target.checked)} /><span><strong>Allow other members to message me</strong><small>When off, nobody can start or continue a conversation with you. You can also block individual members from a conversation.</small></span></label>
    </>)}
  </>
}

function ConversationPage({ username }: { username: string }) {
  const { session } = useCommunity(), [view, setView] = useState<View | null>(null), [error, setError] = useState(''), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [reporting, setReporting] = useState(false), [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0), list = useRef<HTMLOListElement>(null), verified = !!session.user?.verified
  useEffect(() => {
    if (!verified) return
    let cancelled = false
    const load = () => api<View>('/forum/messages/' + encodeURIComponent(username)).then(value => { if (!cancelled) { setView(value); setError('') } }).catch(error => { if (!cancelled) setError(errorText(error)) })
    void load()
    // New messages arrive while the conversation is open, as long as the tab is visible.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [username, verified, revision])
  const count = view?.messages.length ?? 0
  useEffect(() => { if (count) list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }) }, [count])
  async function act(path: string, payload: unknown, done?: () => void) {
    setBusy(true); setError(''); setNotice('')
    try { await post('/forum/messages/' + encodeURIComponent(username) + path, payload); done?.(); setRevision(value => value + 1) } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  const send = () => { const body = draft.trim(); if (body) void act('', { body }, () => setDraft('')) }
  return <>
    <BackLink href="#forum/messages">Messages</BackLink>
    {!verified ? <><div className="page-heading"><div><h1>Messages</h1></div></div><MemberPrompt /></> : error && !view ? <p className="file-error" role="alert">{error}</p> : !view ? <p role="status">Loading conversation…</p> : <>
      <div className="page-heading forum-dm-heading"><div className="forum-dm-member"><ForumAvatar username={view.member.username} avatar={view.member.avatar} /><div><h1>{view.member.displayName || '@' + view.member.username}</h1><a href={'#forum/profile/' + encodeURIComponent(view.member.username)}>@{view.member.username} · View profile</a></div></div>
        <div className="forum-actions"><button type="button" className="button button-quiet" disabled={busy} aria-pressed={view.blocked} onClick={() => void act('/block', { blocked: !view.blocked })}>{view.blocked ? 'Unblock' : 'Block'}</button>{view.messages.length > 0 && <button type="button" className="button button-quiet" disabled={busy} aria-expanded={reporting} onClick={() => setReporting(value => !value)}>Report</button>}</div></div>
      {reporting && <form className="community-form forum-dm-report" onSubmit={event => { event.preventDefault(); const reason = new FormData(event.currentTarget).get('reason'); void act('/report', { reason }, () => { setReporting(false); setNotice('Report sent. The administrator can now read this conversation.') }) }}><p className="service-note">Reporting shares this conversation with the administrator, who can hide messages or suspend the member. Otherwise nobody but the two of you can read it.</p><label>What should the administrator review?<textarea name="reason" required maxLength={1000} rows={2} /></label><div className="forum-actions"><button className="button button-quiet" disabled={busy}>Send report</button><button type="button" className="text-button" onClick={() => setReporting(false)}>Cancel</button></div></form>}
      {notice && <p className="success-note" role="status">{notice}</p>}
      {view.hasMore && <p className="service-note">Only the latest {view.messages.length} messages are shown.</p>}
      <ol className="forum-dm-list" ref={list} aria-label={'Messages with @' + view.member.username}>
        {view.messages.length ? view.messages.map(item => <li key={item.id} data-mine={item.mine || undefined} data-hidden={item.hidden || undefined}>
          <div className="forum-dm-bubble">{item.hidden ? <em>This message was removed by the administrator.</em> : <p className="preserve-lines">{item.body}</p>}</div>
          <ForumTime value={item.created_at} relative />
        </li>) : <li className="forum-dm-empty">No messages yet. Say hello.</li>}
      </ol>
      {view.canSend ? <form className="forum-dm-composer" onSubmit={event => { event.preventDefault(); send() }}>
        <label className="sr-only" htmlFor="forum-dm-draft">Your message</label>
        <textarea id="forum-dm-draft" value={draft} maxLength={MESSAGE_MAX_LENGTH} rows={2} disabled={busy} placeholder={'Message @' + view.member.username + '…'} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
        <button className="button button-primary" disabled={busy || !draft.trim()} aria-label="Send message"><Icon name="arrow" size={16} /></button>
        <span className="forum-field-hint">Enter sends, Shift + Enter adds a line. Plain text, up to {MESSAGE_MAX_LENGTH.toLocaleString()} characters.</span>
      </form> : <p className="forum-locked-note"><Icon name="lock" size={16} />{view.blocked ? 'You blocked this member. Unblock them to write again.' : 'This member is not accepting messages.'}</p>}
      {error && <p className="file-error" role="alert">{error}</p>}
    </>}
  </>
}

/** `#forum/messages` lists conversations; `#forum/messages/<username>` opens one. */
export function ForumMessages({ username }: { username?: string }) {
  return username ? <ConversationPage key={username} username={username} /> : <InboxPage />
}
