import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicAnnouncementCard } from './PublicAnnouncement'
import type { BellItem } from './notification-contract'
import type { NotificationLine } from './notification-text'
import { SUPPORT_URL } from '../config/support'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import audioPreviewAnnouncement from '../../docs/announcements/audio-previews-2026-10-13.draft.json'
import { AUDIO_PREVIEW_GUIDE_HREF, AUDIO_PREVIEW_GUIDE_ROUTE, LEGACY_AUDIO_PREVIEW_GUIDE_HREF } from '../components/audio-preview-guide'
import { FaqPage } from '../components/FaqPage'
import { routeFromUrl } from '../routing'
import { announcementLink } from '../../server/announcements'

let storage: Map<string, string>, news: typeof import('./public-announcement')
const id = (character: string) => 'announcement-' + character.repeat(32)
const item = (character: string, seen = false): BellItem => ({ id: id(character), kind: 'announcement', seen, title: 'A new module', excerpt: 'Explore its features.', created_at: '2026-10-08 12:00:00', url: '#digitakt/module/digipoly', module_id: 'digitakt-digipoly', actor: null, actorOfficial: true, thread_id: null, post_id: null, rating: null, issue_id: null, github_actor: null })
beforeEach(async () => {
  vi.resetModules(); storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  news = await import('./public-announcement')
})
afterEach(() => vi.unstubAllGlobals())

describe('quiet public announcements', () => {
  it('opens a module upload walkthrough from new and already-published announcements', () => {
    expect(audioPreviewAnnouncement.visibility).toBe('public')
    expect(announcementLink(audioPreviewAnnouncement.url)).toBe(AUDIO_PREVIEW_GUIDE_HREF)
    const line = news.publicAnnouncementLine({ ...item('a'), title: audioPreviewAnnouncement.title, excerpt: audioPreviewAnnouncement.body, url: audioPreviewAnnouncement.url, module_id: null })
    const card = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line, onDismiss() {}, onOpen() {} }))
    expect(card).toContain('Show me how')
    expect(card).toContain(`href="${AUDIO_PREVIEW_GUIDE_HREF}"`)
    expect(card).not.toContain('target="_blank"')
    expect(routeFromUrl(new URL('https://modwerk.app/' + LEGACY_AUDIO_PREVIEW_GUIDE_HREF), new URL('https://modwerk.app/'))).toBe(AUDIO_PREVIEW_GUIDE_ROUTE)
    const oldCard = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line: { ...line, href: LEGACY_AUDIO_PREVIEW_GUIDE_HREF }, onDismiss() {}, onOpen() {} }))
    expect(oldCard).toContain(`href="${AUDIO_PREVIEW_GUIDE_HREF}"`)
    expect(oldCard).toContain('Show me how')
    const guide = renderToStaticMarkup(createElement(FaqPage, { previewGuide: true }))
    expect(guide).toContain('Add an audio preview')
    expect(guide).toContain('class="faq-question" open=""')
    for (const instruction of ['Previews', 'verified account', 'WAV, MP3 or Ogg', '12 MB', 'credit', 'caption', 'permission', 'Remove preview']) expect(guide).toContain(instruction)
    expect(guide).not.toContain('How do I flash an Octatrack')
    expect(renderToStaticMarkup(createElement(FaqPage))).toContain('How do I add an audio preview?')
  })
  it('keeps the complete public message and paragraph breaks so the hosting explanation is visible', () => {
    const body = 'A'.repeat(180) + '\n\nOptional support helps cover hosting costs. Modwerk stays free.'
    const line = news.publicAnnouncementLine({ ...item('a'), excerpt: body, url: SUPPORT_URL })
    expect(line.excerpt).toBe(body)
    const markup = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line, onDismiss() {}, onOpen() {} }))
    expect(markup).toContain('Optional support helps cover hosting costs. Modwerk stays free.')
  })
  it('shows only the newest announcement and never replaces a dismissed card with the older backlog', async () => {
    expect(news.latestPublicAnnouncement([item('a'), item('b')])?.id).toBe(id('a'))
    news.dismissPublicAnnouncement(id('a'))
    expect(news.latestPublicAnnouncement([item('a'), item('b')])).toBeNull()
    vi.resetModules()
    const nextVisit = await import('./public-announcement')
    expect(nextVisit.latestPublicAnnouncement([item('a'), item('b')])).toBeNull()
    expect(nextVisit.latestPublicAnnouncement([item('c'), item('a')])?.id).toBe(id('c'))
    expect(nextVisit.latestPublicAnnouncement([item('c', true), item('b')])).toBeNull()
    expect(nextVisit.latestPublicAnnouncement([])).toBeNull()
  })
  it('keeps news dismissed for this visit when storage is blocked and tolerates damaged saved data', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } })
    news.dismissPublicAnnouncement(id('a'))
    expect(news.latestPublicAnnouncement([item('a')])).toBeNull()
    expect(news.latestPublicAnnouncement([item('b')])?.id).toBe(id('b'))
    vi.stubGlobal('localStorage', { getItem: () => '{broken json' })
    expect(news.latestPublicAnnouncement([item('b')])?.id).toBe(id('b'))
  })
  it('renders module and external actions accessibly, using the real logo and escaped announcement copy', () => {
    const line: NotificationLine = { kind: 'announcement', text: '<script>test</script>', excerpt: 'A new module for your configuration.', href: '#digitakt/module/digipoly', ids: [id('a')], seen: false, created_at: '', actor: null, official: true, avatar: null }
    const render = (value: NotificationLine) => renderToStaticMarkup(createElement(PublicAnnouncementCard, { line: value, onDismiss() {}, onOpen() {} }))
    const module = render(line)
    expect(module).toContain('modwerk-mark.svg'); expect(module).toContain('aria-label="Dismiss announcement"')
    expect(module).toContain('Explore module'); expect(module).toContain('&lt;script&gt;test&lt;/script&gt;')
    expect(module).not.toContain('target="_blank"')
    expect(module).not.toContain('href="#credits"')
    const external = render({ ...line, href: 'https://modwerk.app/#library' })
    expect(external).toContain('target="_blank" rel="noreferrer"')
    expect(external).toContain('opens in a new tab')
    const support = render({ ...line, href: SUPPORT_URL })
    expect(support).toContain('Support on Ko-fi')
    expect(support).toContain('href="#credits"')
    expect(support).toContain('Credits &amp; acknowledgements')
    expect(support).toContain('target="_blank" rel="noreferrer"')
    expect(support).toContain('aria-label="Dismiss announcement"')
  })
  it('turns a Discord announcement into the community invitation, offering signed-out visitors an account too', () => {
    const line: NotificationLine = { kind: 'announcement', text: 'Join the Modwerk community', excerpt: 'Meet other developers on Discord.', href: DEVELOPMENT_DISCORD_URL, ids: [id('a')], seen: false, created_at: '', actor: null, official: true, avatar: null }
    const member = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line, onDismiss() {}, onOpen() {} }))
    expect(member).toContain('Join Discord'); expect(member).toContain('auth/discord.svg')
    expect(member).toContain(`href="${DEVELOPMENT_DISCORD_URL}" target="_blank" rel="noreferrer"`)
    expect(member).toContain('opens in a new tab')
    expect(member).not.toContain('Create account')
    const visitor = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line, signup: '#account/register?next=library', onDismiss() {}, onOpen() {} }))
    expect(visitor).toContain('Join Discord')
    expect(visitor).toContain('href="#account/register?next=library"')
    expect(visitor).toContain('Create account')
    const other = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line: { ...line, href: '#library' }, signup: '#account/register?next=library', onDismiss() {}, onOpen() {} }))
    expect(other).not.toContain('Create account'); expect(other).not.toContain('Join Discord')
  })
})
