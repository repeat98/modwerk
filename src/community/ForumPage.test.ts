// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ForumPage } from './ForumPage'
import { CommunityContext } from './context'
import { api, onCommunityReconnect, post } from './api'
import type { ForumVisit } from './forum-contract'

vi.mock('./api', () => ({ api: vi.fn(), apiFetch: vi.fn(), post: vi.fn(), onCommunityReconnect: vi.fn() }))
vi.mock('./GetStarted', () => ({ GetStarted: () => null }))
vi.mock('./MembersOnline', () => ({ ForumOnlineNow: () => null }))
vi.mock('./ForumShowcase', () => ({ ForumShowcase: () => createElement('section', { 'aria-label': 'Showcase' }) }))
vi.mock('./ForumHighlights', () => ({ ForumHighlights: () => null }))
vi.mock('./ForumDirectory', () => ({ ForumDirectory: () => null }))
vi.mock('./ForumRecentPosts', () => ({ ForumRecentPosts: () => null }))

const session = { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } }
const caughtUp: ForumVisit = { since: '2026-10-09 10:00:00', newThreads: 0, newReplies: 0, unreadFollowed: 0 }
let root: Root, container: HTMLDivElement, visit: ForumVisit
const reconnectListeners = new Set<() => void>()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  visit = caughtUp
  vi.mocked(api).mockImplementation(async path => path === '/forum/visit' ? visit : { threads: [], hasMore: false })
  vi.mocked(post).mockResolvedValue({ ok: true })
  reconnectListeners.clear()
  vi.mocked(onCommunityReconnect).mockImplementation(listener => { reconnectListeners.add(listener); return () => { reconnectListeners.delete(listener) } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (route = 'forum') => act(async () => root.render(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(ForumPage, { route, configurations: [], onCopy: () => {} }))))
const banner = () => container.querySelector('.forum-since-visit')

it('puts discussions first on the home page and the gallery first in the Showcase topic', async () => {
  const discussions = () => container.querySelector('.forum-discussions')!
  const showcase = () => container.querySelector('[aria-label="Showcase"]')!
  await render()
  expect(discussions().compareDocumentPosition(showcase()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await render('forum?category=showcase')
  expect(showcase().compareDocumentPosition(discussions()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('waits for a stored session before building the page under its heading', async () => {
  await act(async () => root.render(createElement(CommunityContext.Provider, { value: { session: { available: false, admin: false, user: null }, settled: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(ForumPage, { route: 'forum', configurations: [], onCopy: () => {} }))))
  expect(container.querySelector('h1')?.textContent).toBe('Community forum')
  expect(container.querySelector('.forum-pending')).not.toBeNull()
  // No visitor toolbar or sign-in note to rearrange once the member arrives.
  expect(container.querySelector('.forum-toolbar')).toBeNull()
  expect(container.textContent).not.toContain('Sign in')
  await render()
  expect(container.querySelector('.forum-pending')).toBeNull()
  expect(container.querySelector('.forum-toolbar')?.textContent).toContain('Following')
})

it('shows the visit banner together with the discussions, above them', async () => {
  let answer!: (value: ForumVisit) => void
  const pendingVisit = new Promise<ForumVisit>(resolve => { answer = resolve })
  vi.mocked(api).mockImplementation(async path => path === '/forum/visit' ? pendingVisit : { threads: [], hasMore: false })
  await render()
  // The threads are in, but the list waits for the banner so the banner never pushes it down.
  expect(container.querySelector('.forum-thread-list[aria-busy="true"]')).not.toBeNull()
  expect(banner()).toBeNull()
  await act(async () => answer({ ...caughtUp, newThreads: 2 }))
  expect(container.querySelector('.forum-thread-list[aria-busy="true"]')).toBeNull()
  const section = container.querySelector('.forum-discussions')!
  expect(section.contains(banner())).toBe(true)
  expect(banner()!.compareDocumentPosition(section.querySelector('.forum-empty')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('reloads discussions that failed during an outage once the service answers again', async () => {
  const offline = new Error('Couldn’t reach the Modwerk community service.')
  vi.mocked(api).mockImplementation(async path => { if (path === '/forum/visit') return visit; throw offline })
  await render()
  expect(container.textContent).toContain('Discussions could not load')
  expect(reconnectListeners.size).toBe(1)
  vi.mocked(api).mockImplementation(async path => path === '/forum/visit' ? visit : { threads: [], hasMore: false })
  await act(async () => { for (const listener of reconnectListeners) listener() })
  expect(container.textContent).not.toContain('Discussions could not load')
  expect(reconnectListeners.size).toBe(0)
})

it('hides the visit banner when caught up and on the first visit', async () => {
  await render()
  expect(banner()).toBeNull()
  expect(container.textContent).not.toContain('You’re all caught up.')
  await render('forum?following=1')
  visit = { ...caughtUp, since: null, unreadFollowed: 1 }
  await render()
  expect(banner()).toBeNull()
})

it('links positive counts to their unread views and omits empty activity categories', async () => {
  visit = { ...caughtUp, newReplies: 2, unreadFollowed: 1 }
  await render()
  const links = [...banner()!.querySelectorAll('li a')]
  expect(links.map(link => link.getAttribute('href'))).toEqual(['#forum?following=1&unread=1', '#forum?following=1&unread=1'])
  expect(links.map(link => link.textContent)).toEqual(['2new replies in threads you follow', '1unread followed thread'])
  await render('forum?following=1&unread=1')
  visit = { ...caughtUp, newThreads: 1 }
  await render()
  expect(banner()!.querySelector('li a')?.getAttribute('href')).toBe('#forum?sort=newest&unread=1')
  expect(banner()!.querySelectorAll('li')).toHaveLength(1)
})

it('hides the banner on returning home after reading the followed activity', async () => {
  visit = { ...caughtUp, newReplies: 1, unreadFollowed: 1 }
  await render()
  expect(banner()).not.toBeNull()
  await render('forum?following=1&unread=1')
  visit = caughtUp
  await render()
  expect(banner()).toBeNull()
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/forum/visit')).toHaveLength(2)
})

it('keeps the banner after a failed mark-read request and removes it after success', async () => {
  visit = { ...caughtUp, newThreads: 1, newReplies: 2, unreadFollowed: 1 }
  await render()
  const readAll = () => banner()!.querySelector('button')!.click()
  vi.mocked(post).mockRejectedValueOnce(new Error('Offline'))
  await act(async () => readAll())
  expect(banner()).not.toBeNull()
  expect(banner()!.querySelector('button')?.disabled).toBe(false)
  await act(async () => readAll())
  expect(post).toHaveBeenLastCalledWith('/forum/read-all', {})
  expect(banner()).toBeNull()
  expect(vi.mocked(api).mock.calls.filter(([path]) => path.startsWith('/forum/threads?'))).toHaveLength(2)
})
