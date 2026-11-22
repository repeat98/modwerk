// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ForumShowcase } from './ForumShowcase'
import { CommunityContext } from './context'
import { api } from './api'
import type { ForumShowcaseItem } from './forum-contract'

vi.mock('./api', () => ({ api: vi.fn(), onCommunityReconnect: vi.fn(() => () => {}) }))

const session = { available: true, admin: false, user: null, forumMedia: true }
const share = (id: string, machine = 'octatrack'): ForumShowcaseItem => ({
  id, thread_id: 'thread-' + id, title: 'Share ' + id, created_at: '2026-10-20T10:00:00Z',
  username: 'member', official: 0, category: 'showcase', machine, page: 0,
  attachments: [{ id: 'image-' + id, kind: 'image', caption: '' }],
})
function pendingFeed() {
  let resolve!: (items: ForumShowcaseItem[]) => void
  const promise = new Promise<ForumShowcaseItem[]>(complete => { resolve = complete })
  return { promise, resolve }
}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const render = (machine?: string, context: { session?: typeof session | { available: boolean; admin: boolean; user: null }; settled?: boolean } = {}) => act(async () => root.render(createElement(CommunityContext.Provider, {
  value: { session: context.session ?? session, settled: context.settled, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} },
}, createElement(ForumShowcase, { machine, shareHref: '#forum/new?category=showcase' }))))
const strip = () => container.querySelector<HTMLUListElement>('.forum-showcase-strip')!

it('shows loading cards shaped like shares while the session is still being checked', async () => {
  vi.mocked(api).mockReturnValueOnce(pendingFeed().promise)
  await render(undefined, { session: { available: false, admin: false, user: null }, settled: false })
  const cards = strip().querySelectorAll('.forum-showcase-loading:not(.forum-showcase-ghost)')
  expect(cards).toHaveLength(3)
  // The same title, caption and author lines as a loaded card, so the strip keeps its height when shares arrive.
  expect(cards[0].querySelector('.forum-showcase-copy h3 .forum-skeleton')).not.toBeNull()
  expect(cards[0].querySelector('.forum-showcase-caption .forum-skeleton')).not.toBeNull()
  expect(cards[0].querySelector('.forum-showcase-meta .forum-avatar')).not.toBeNull()
})

it('hides the strip once the session shows that media sharing is off', async () => {
  vi.mocked(api).mockResolvedValueOnce([])
  await render(undefined, { session: { available: true, admin: false, user: null }, settled: true })
  expect(container.querySelector('.forum-showcase')).toBeNull()
})

it('keeps a full strip height with only the invitation when the feed is empty', async () => {
  vi.mocked(api).mockResolvedValueOnce([])
  await render()
  expect(strip().dataset.empty).toBe('true')
  expect(strip().querySelector('.forum-showcase-ghost')).not.toBeNull()
  expect(strip().querySelector('.forum-showcase-invite strong')?.textContent).toBe('Be the first to share')
})

it('keeps the strip in place with the invitation when the feed fails', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Offline'))
  await render()
  expect(container.querySelector('.forum-showcase')).not.toBeNull()
  expect(strip().querySelector('.forum-showcase-ghost')).not.toBeNull()
  expect(strip().querySelector('.forum-showcase-invite')?.textContent).toContain('could not load')
})

it('resets to the invitation and newest shares when cards replace loading placeholders', async () => {
  const response = pendingFeed()
  vi.mocked(api).mockReturnValueOnce(response.promise)
  await render()
  const loading = strip(), invite = loading.querySelector('.forum-showcase-invite')
  loading.scrollLeft = 488
  await act(async () => response.resolve([share('newest'), share('older'), share('oldest')]))
  expect(strip().scrollLeft).toBe(0)
  expect(strip()).not.toBe(loading)
  expect(strip().querySelector('.forum-showcase-invite')).not.toBe(invite)
  expect([...strip().children].map(item => item.querySelector('strong, .forum-showcase-title')?.textContent))
    .toEqual(['Share yours', 'Share newest', 'Share older', 'Share oldest'])

  // Ordinary parent renders must keep the reader's chosen position.
  strip().scrollLeft = 244
  const loaded = strip()
  await render()
  expect(strip()).toBe(loaded)
  expect(strip().scrollLeft).toBe(244)
})

it('starts the filtered feed at its newest shares after scrolling through posts', async () => {
  vi.mocked(api).mockResolvedValueOnce([share('newest'), share('older')])
  await render()
  strip().scrollLeft = 488
  const response = pendingFeed()
  vi.mocked(api).mockReturnValueOnce(response.promise)
  await render('digitakt')
  // The previous cards can still be visible while the new request is pending.
  strip().scrollLeft = 488
  const previous = strip()
  await act(async () => response.resolve([share('filtered-newest', 'digitakt'), share('filtered-older', 'digitakt')]))
  expect(api).toHaveBeenLastCalledWith('/forum/showcase?machine=digitakt')
  expect(strip()).not.toBe(previous)
  expect(strip().scrollLeft).toBe(0)
  expect(strip().querySelector('.forum-showcase-title')?.textContent).toBe('Share filtered-newest')
})
