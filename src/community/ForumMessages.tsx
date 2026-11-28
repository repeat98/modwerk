import { useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { BackLink } from '../components/BackLink'
import { Icon } from '../components/Icon'
import { MemberInvite } from './MemberPrompt'
import { ForumAvatar } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import { MESSAGE_MAX_LENGTH } from './forum-contract'
import { MentionText, useTextareaMentions } from './mentions'
import { TextVideo } from './YouTubeEmbed'
import { profileHref } from '../routing'
import { PostMenu } from './ForumThreadView'

type Conversation = { id: string; updated_at: string; username: string; displayName: string; avatar: string | null; excerpt: string | null; mine: number; unread: number }
type Inbox = { conversations: Conversation[]; enabled: boolean }
type View = { member: { username: string; displayName: string; avatar: string | null }; messages: { id: string; mine: boolean; body: string; hidden: boolean; created_at: string }[]; blocked: boolean; canSend: boolean; hasMore: boolean }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const sentAt = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')

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
    // The switch moves at once and moves back if the server refuses.
    setBusy(true); setError(''); setInbox(current => current && { ...current, enabled })
    try { await post('/forum/messages/settings', { enabled }, 'PATCH') } catch (error) { setInbox(current => current && { ...current, enabled: !enabled }); setError(errorText(error)) } finally { setBusy(false) }
  }
  return <>
    <BackLink href="#forum">All discussions</BackLink>
    <div className="page-heading forum-heading"><div><h1>Messages</h1><p>Conversations between you and one other member.</p></div></div>
    <MemberInvite id="forum-messages-join" title="Sign in to read your messages" text="A free account lets you write to other members and read their replies here." next="forum/messages" />
    {verified && (!inbox ? error ? <p className="file-error" role="alert">{error}</p> : <p className="service-note" role="status">Loading messages…</p> : <>
      {inbox.conversations.length ? <ul className="forum-dm-inbox" aria-label="Conversations">{inbox.conversations.map(item => <li key={item.id} data-unread={item.unread > 0 || undefined}>
        <a href={'#forum/messages/' + encodeURIComponent(item.username)}>
          <ForumAvatar username={item.username} avatar={item.avatar} />
          <span className="forum-dm-inbox-copy"><span className="forum-dm-inbox-head"><strong>{item.displayName || '@' + item.username}</strong><ForumTime value={item.updated_at} relative /></span><span className="forum-dm-inbox-excerpt">{item.mine ? 'You: ' : ''}{item.excerpt ?? 'No messages yet.'}</span></span>
          {item.unread > 0 && <span className="forum-dm-unread" aria-label={item.unread + ' unread'}>{item.unread}</span>}
        </a>
      </li>)}</ul> : <div className="forum-empty"><Icon name="mail" size={28} /><h2>No messages yet</h2><p>Open a member's profile and choose “Send a message” to start a conversation.</p><a className="button button-quiet" href="#forum">Browse discussions</a></div>}
      <label className="forum-dm-setting"><input type="checkbox" checked={inbox.enabled} disabled={busy} onChange={event => void toggle(event.target.checked)} /><span><strong>Allow other members to message me</strong><small>When off, nobody can start or continue a conversation with you. You can also block individual members from a conversation.</small></span></label>
      {error && <p className="file-error" role="alert">{error}</p>}
    </>)}
  </>
}

function ConversationPage({ username }: { username: string }) {
  const { session } = useCommunity(), [view, setView] = useState<View | null>(null), [error, setError] = useState(''), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [reporting, setReporting] = useState(false), [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0), list = useRef<HTMLOListElement>(null), verified = !!session.user?.verified
  const composer = useRef<HTMLTextAreaElement>(null), mentions = useTextareaMentions(composer, draft, setDraft, 'forum-dm-mentions')
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
  // Opening a conversation shows its end with the field to answer in, clear of the floating buttons.
  useEffect(() => { if (count) (composer.current?.form ?? list.current?.lastElementChild)?.scrollIntoView({ block: 'nearest' }) }, [count])
  async function act(path: string, payload: unknown, done?: () => void) {
    setBusy(true); setError(''); setNotice('')
    try { await post('/forum/messages/' + encodeURIComponent(username) + path, payload); done?.(); setRevision(value => value + 1) } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  const send = () => { const body = draft.trim(); if (body) void act('', { body }, () => { setDraft(''); composer.current?.focus() }) }
  return <>
    <BackLink href="#forum/messages">Messages</BackLink>
    {!verified ? <><div className="page-heading"><div><h1>Messages</h1></div></div><MemberInvite id="forum-conversation-join" title="Sign in to read this conversation" text="A free account lets you write to other members and read their replies here." next={'forum/messages/' + encodeURIComponent(username)} /></> : error && !view ? <p className="file-error" role="alert">{error}</p> : !view ? <p className="service-note" role="status">Loading conversation…</p> : <>
      <div className="page-heading forum-dm-heading"><div className="forum-dm-member"><ForumAvatar username={view.member.username} avatar={view.member.avatar} /><div><h1>{view.member.displayName || '@' + view.member.username}</h1><a href={profileHref(view.member.username)}>{view.member.displayName && view.member.displayName !== view.member.username && '@' + view.member.username + ' · '}View profile</a>{view.blocked && <span className="forum-dm-blocked">Blocked</span>}</div></div>
        {/* Blocking and reporting stay one tap away without greeting a new conversation. */}
        <PostMenu label={'More actions for the conversation with @' + view.member.username} items={[{ label: (view.blocked ? 'Unblock @' : 'Block @') + view.member.username, onSelect: () => void act('/block', { blocked: !view.blocked }) }, ...(view.messages.length ? [{ label: 'Report conversation', onSelect: () => setReporting(true) }] : [])]} /></div>
      {reporting && <form className="community-form forum-dm-report" onSubmit={event => { event.preventDefault(); const reason = new FormData(event.currentTarget).get('reason'); void act('/report', { reason }, () => { setReporting(false); setNotice('Report sent. The administrator can now read this conversation.') }) }}><label>Report this conversation<span className="forum-field-hint">Reporting shares this conversation with the administrator, who can hide messages or suspend the member. Otherwise nobody but the two of you can read it.</span><textarea name="reason" required maxLength={1000} rows={2} placeholder="What should the administrator review?" autoFocus /></label><div className="forum-actions"><button type="button" className="text-button" onClick={() => setReporting(false)}>Cancel</button><button className="button button-quiet" disabled={busy}>Send report</button></div></form>}
      {notice && <p className="success-note" role="status">{notice}</p>}
      {view.hasMore && <p className="service-note">Only the latest {view.messages.length} messages are shown.</p>}
      <ol className="forum-dm-list" ref={list} aria-label={'Messages with @' + view.member.username}>
        {view.messages.length ? view.messages.map((item, index) => {
          // Quick messages from one side form a run: the time and the bubble's tail show once, on its last message.
          const next = view.messages[index + 1], grouped = !!next && next.mine === item.mine && sentAt(next.created_at) - sentAt(item.created_at) < 300000
          return <li key={item.id} data-mine={item.mine || undefined} data-hidden={item.hidden || undefined} data-grouped={grouped || undefined}>
          <div className="forum-dm-bubble">{item.hidden ? <em>This message was removed by the administrator.</em> : <><p className="preserve-lines"><MentionText text={item.body}/></p><TextVideo text={item.body}/></>}</div>
          <ForumTime value={item.created_at} relative />
        </li>
        }) : <li className="forum-dm-empty">{view.blocked ? 'No messages yet.' : 'No messages yet. Say hello.'}</li>}
      </ol>
      {view.canSend ? <form className="forum-dm-composer" onSubmit={event => { event.preventDefault(); send() }}>
        <label className="sr-only" htmlFor="forum-dm-draft">Your message</label>
        <textarea ref={composer} id="forum-dm-draft" value={draft} maxLength={MESSAGE_MAX_LENGTH} rows={2} readOnly={busy} aria-busy={busy} placeholder={'Message @' + view.member.username + '…'} aria-describedby="forum-dm-hint" onChange={event => setDraft(event.target.value)} onSelect={mentions.onSelect} onKeyUp={mentions.onKeyUp} onClick={mentions.onClick} {...mentions.aria} onKeyDown={event => { if (mentions.onKeyDown(event)) return; if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) send() } }} />
        {mentions.list}
        <button className="button button-primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}<Icon name="arrow" size={14} /></button>
        <p id="forum-dm-hint">Private · @{session.user?.username}<span><span className="composer-keys">Shift + Enter for a new line</span>{draft.length > MESSAGE_MAX_LENGTH - 150 && <span>{draft.length} / {MESSAGE_MAX_LENGTH}</span>}</span></p>
      </form> : <p className="forum-locked-note"><Icon name="lock" size={16} />{view.blocked ? <span>You blocked this member. <button type="button" className="text-button" disabled={busy} onClick={() => void act('/block', { blocked: false })}>Unblock</button></span> : 'This member is not accepting messages.'}</p>}
      {error && <p className="file-error" role="alert">{error}</p>}
    </>}
  </>
}

/** `#forum/messages` lists conversations; `#forum/messages/<username>` opens one. */
export function ForumMessages({ username }: { username?: string }) {
  return username ? <ConversationPage key={username} username={username} /> : <InboxPage />
}
