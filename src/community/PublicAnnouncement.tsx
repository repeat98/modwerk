import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { assetUrl } from '../hosting'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { SUPPORT_URL } from '../config/support'
import { api, post } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import { useCommunity } from './context'
import { claimDiscordInvite, discordInviteHandledHere } from './discord-invite'
import discordInvitation from '../../docs/news/development-discord-announcement.json'
import audioPreviewAnnouncement from '../../docs/announcements/audio-previews-2026-10-13.draft.json'
import { AUDIO_PREVIEW_GUIDE_HREF, LEGACY_AUDIO_PREVIEW_GUIDE_HREF } from '../components/audio-preview-guide'
import { accountHref } from './member-access'
import type { BellItem } from './notification-contract'
import type { NotificationLine } from './notification-text'
import { dismissPublicAnnouncement, latestPublicAnnouncement, pageBusy, publicAnnouncementDismissed, publicAnnouncementLine } from './public-announcement'
import { countSupportPrompt, trackAnnouncement, trackUsage } from './usage'
import { answerSupportPrompt } from './support-prompt'

/** The same card is used in the public prompt and the operator's preview. It never takes focus. `signup` adds Create account to a Discord card. */
export function PublicAnnouncementCard({ line, signup, onDismiss, onOpen }: { line: NotificationLine; signup?: string; onDismiss: () => void; onOpen: (action?: 'signup') => void }) {
  // Already-published cards and shared links keep working after the walkthrough moves.
  if (line.href === LEGACY_AUDIO_PREVIEW_GUIDE_HREF) line = { ...line, href: AUDIO_PREVIEW_GUIDE_HREF }
  const titleId = useId(), moduleLink = /^#(?:module\/|(?:digitakt|digitone)\/module\/)/.test(line.href), supportLink = !!SUPPORT_URL && line.href === SUPPORT_URL, discordLink = line.href === DEVELOPMENT_DISCORD_URL, previewGuide = line.href === AUDIO_PREVIEW_GUIDE_HREF, external = /^https?:/.test(line.href)
  const betaInvite = line.href === '#beta/join/public'
  const action = <a className="public-announcement-action" href={line.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} onClick={() => { if (supportLink) { trackUsage('support_link_opened'); countSupportPrompt('announcement-kofi'); answerSupportPrompt('kofi') } onOpen() }}>{supportLink && <Icon name="heart" size={15} />}{discordLink && <img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" />}{supportLink ? 'Support on Ko-fi' : discordLink ? 'Join Discord' : betaInvite ? 'Join the beta' : previewGuide ? 'Show me how' : moduleLink ? 'Explore module' : 'Take a look'}<Icon name="arrow" size={16} />{external && <span className="sr-only"> (opens in a new tab)</span>}</a>
  return <section className="public-announcement-card" aria-labelledby={titleId} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onDismiss() } }}>
    <header>
      <span className="public-announcement-brand"><img src={assetUrl('modwerk-mark.svg')} width={28} height={28} alt="" /><span>Modwerk news</span></span>
      <button type="button" className="icon-button" aria-label="Dismiss announcement" onClick={onDismiss}><Icon name="close" size={17} /></button>
    </header>
    {moduleLink && !previewGuide && <span className="public-announcement-kicker">Module news</span>}
    <h2 id={titleId}>{line.text}</h2>
    {line.excerpt && <p>{line.excerpt}</p>}
    {supportLink && <a className="public-announcement-credits" href="#credits" onClick={() => onOpen()}>Credits &amp; acknowledgements<Icon name="arrow" size={14} /></a>}
    {discordLink && signup ? <div className="public-announcement-actions">{action}<a className="public-announcement-action" href={signup} onClick={() => onOpen('signup')}>Create account<Icon name="arrow" size={16} /></a></div> : action}
  </section>
}

export function PublicAnnouncement({ enabled, next }: { enabled: boolean; next: string }) {
  const { session, loading } = useCommunity(), memberId = session.user?.verified ? session.user.id : null
  const [preview] = useState(() => {
    if (!import.meta.env.DEV) return null
    const value = new URLSearchParams(window.location.search).get('preview')
    return value === 'discord-member' || value === 'discord-visitor' || value === 'previews-announcement' ? value : null
  })
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const previewCopy = preview === 'previews-announcement' ? audioPreviewAnnouncement : discordInvitation
  if (preview) return previewDismissed ? null : <aside className="public-announcement" aria-label="Public announcement"><PublicAnnouncementCard line={{ kind: 'announcement', text: previewCopy.title, excerpt: previewCopy.body, href: preview === 'previews-announcement' ? AUDIO_PREVIEW_GUIDE_HREF : DEVELOPMENT_DISCORD_URL, ids: ['preview'], seen: false, created_at: '', actor: null, official: true, avatar: null }} signup={preview === 'discord-visitor' ? accountHref('register', next) : undefined} onDismiss={() => setPreviewDismissed(true)} onOpen={() => setPreviewDismissed(true)} /></aside>
  // Account changes reload only the public acknowledgement state; no private content enters this surface.
  return <PublicAnnouncementContent key={session.user?.id ?? 'visitor'} memberId={memberId} signup={session.user ? undefined : accountHref('register', next)} enabled={enabled && !loading} />
}
function PublicAnnouncementContent({ memberId, signup, enabled }: { memberId: string | null; signup?: string; enabled: boolean }) {
  const member = !!memberId
  const [item, setItem] = useState<BellItem | null>(null), [visible, setVisible] = useState(false), counted = useRef(''), presented = useRef('')
  const [failed, setFailed] = useState(false), [revision, setRevision] = useState(0)
  const discord = item?.url === DEVELOPMENT_DISCORD_URL
  useEffect(() => {
    const controller = new AbortController()
    void api<{ items: BellItem[] }>(member ? '/announcements/mine' : '/announcements', { signal: controller.signal }).then(value => {
      // The anonymous feed carries no member state; local dismissal supplies it instead.
      if (!controller.signal.aborted) { setFailed(false); setItem(latestPublicAnnouncement(member ? value.items : value.items.map(item => ({ ...item, seen: false })))) }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) }) // Optional news never interrupts the local workspace on a failed read.
    return () => controller.abort()
  }, [member, revision])
  useReconnectRetry(failed, setRevision)
  useEffect(() => {
    if (!item) return
    let timer: number | undefined, cancelled = false
    // Members still claim a handled browser invitation so it stays quiet on other devices too.
    const retired = () => publicAnnouncementDismissed(item.id) || (item.url === DEVELOPMENT_DISCORD_URL && presented.current !== item.id && discordInviteHandledHere())
    const blocked = () => !enabled || pageBusy()
    function check() {
      if (retired()) {
        if (memberId && item!.url === DEVELOPMENT_DISCORD_URL) void claimDiscordInvite(memberId).catch(() => {})
        setItem(null); return
      }
      if (blocked()) {
        window.clearTimeout(timer); timer = undefined; setVisible(false)
      } else if (timer === undefined) {
        // Let the page settle. No countdown, sound, backdrop, auto-dismiss or focus change.
        timer = window.setTimeout(() => {
          if (retired()) { setItem(null); return }
          if (blocked()) { timer = undefined; return }
          if (item!.url !== DEVELOPMENT_DISCORD_URL || presented.current === item!.id) { setVisible(true); return }
          // Claim only once the card can appear, preserving existing browser/account markers.
          void claimDiscordInvite(memberId).then(result => {
            if (cancelled) return
            if (!result.show) { setItem(null); return }
            presented.current = item!.id
            timer = undefined
            if (!blocked()) setVisible(true)
            else check()
          }).catch(() => { if (!cancelled) setItem(null) })
        }, 4000)
      }
    }
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    document.addEventListener('visibilitychange', check)
    document.addEventListener('focusin', check); document.addEventListener('focusout', check)
    window.addEventListener('storage', check)
    check()
    return () => { cancelled = true; window.clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', check); document.removeEventListener('focusin', check); document.removeEventListener('focusout', check); window.removeEventListener('storage', check) }
  }, [enabled, item, memberId])
  // Once per card on this page, however often a dialog hides and reveals it. Signed-out views of a Discord card also keep the visitor invitation totals.
  useEffect(() => {
    if (!visible || !item || counted.current === item.id) return
    counted.current = item.id
    trackAnnouncement('announcement_shown', item.id)
    if (discord) trackUsage(signup ? 'discord_visitor_prompt_shown' : 'discord_member_prompt_shown')
  }, [visible, item, discord, signup])
  function acknowledge(action: 'open' | 'signup' | 'dismiss') {
    if (!item) return
    trackAnnouncement(action === 'dismiss' ? 'announcement_dismissed' : 'announcement_opened', item.id)
    if (discord) {
      trackUsage(signup ? action === 'signup' ? 'discord_visitor_signup_clicked' : action === 'open' ? 'discord_visitor_join_clicked' : 'discord_visitor_dismissed' : action === 'open' ? 'discord_member_join_clicked' : 'discord_member_dismissed')
    }
    dismissPublicAnnouncement(item.id); setItem(null)
    if (member) void post('/announcements/mine', { ids: [item.id] }, 'PATCH').catch(() => {})
  }
  if (!enabled || !item || !visible) return null
  return <aside className="public-announcement" aria-label="Public announcement"><PublicAnnouncementCard line={publicAnnouncementLine(item)} signup={signup} onDismiss={() => acknowledge('dismiss')} onOpen={action => acknowledge(action ?? 'open')} /></aside>
}
