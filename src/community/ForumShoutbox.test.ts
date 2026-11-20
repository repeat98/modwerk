// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommunityContext, emptySession } from './context'
import { ForumShoutbox } from './ForumShoutbox'
import { api } from './api'
import type { ForumShout, ForumShouts } from './forum-contract'

vi.mock('./api', () => ({ api: vi.fn(), apiFetch: vi.fn(), post: vi.fn() }))

const shout = (id: string, overrides: Partial<ForumShout> = {}): ForumShout => ({
  id, body: id, username: 'alex', created_at: '2026-11-19 12:00:00', edited_at: null, hidden: 0, canEdit: false, ...overrides,
})
let root: Root, container: HTMLDivElement, feed: ForumShouts
const render = (props = { floating: true }, member = '') => act(async () => {
  const session = { ...emptySession, available: true, user: member ? { id: member, username: member, displayName: member, verified: true } : null }
  root.render(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(ForumShoutbox, props)))
})
const badge = () => container.querySelector('.shoutbox-unread')?.textContent
const launcher = () => container.querySelector<HTMLButtonElement>('#shoutbox-launcher')!
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(30000) })
const visibility = (state: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  return act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()
  feed = { messages: [shout('old')], hasMore: false }
  vi.mocked(api).mockImplementation(async () => feed)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('starts clear, counts new messages during visible polling, and clears on opening', async () => {
  await render()
  expect(badge()).toBeUndefined()
  feed = { messages: [shout('newest'), shout('new'), shout('old', { edited_at: '2026-11-19 12:01:00' })], hasMore: false }
  await visibility('hidden')
  await tick()
  expect(api).toHaveBeenCalledTimes(1)
  await visibility('visible')
  expect(badge()).toBe('2')
  expect(launcher().getAttribute('aria-label')).toBe('Shoutbox 8, 2 new messages')
  await act(async () => launcher().click())
  await act(async () => { await vi.advanceTimersByTimeAsync(17) })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Minimize Shoutbox 8')
  await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  await act(async () => { await vi.advanceTimersByTimeAsync(17) })
  expect(document.activeElement).toBe(launcher())
  expect(badge()).toBeUndefined()
})

it('keeps separate guest and member progress and excludes edits, own and hidden messages', async () => {
  await render({ floating: true }, 'alex')
  feed = { messages: [shout('other'), shout('mine', {canEdit: true}), shout('moderated', {hidden: 1}), shout('old')], hasMore: false }
  await tick()
  expect(badge()).toBe('1')
  await render()
  expect(badge()).toBeUndefined()
  await render({ floating: true }, 'alex')
  expect(badge()).toBe('1')
  feed = { messages: [shout('other')], hasMore: false }
  await tick()
  expect(badge()).toBe('1')
})

it('handles an empty first visit, a long absence, and read progress shared by the archive', async () => {
  feed = { messages: [], hasMore: false }
  await render()
  feed = { messages: Array.from({length: 50}, (_, i) => shout('new-' + i)), hasMore: true }
  await tick()
  expect(badge()).toBe('50+')
  await act(async () => root.render(createElement(ForumShoutbox, { archive: true, page: 1 })))
  await render()
  expect(badge()).toBe('50+')
  await act(async () => root.render(createElement(ForumShoutbox, { archive: true, page: 0 })))
  await render()
  expect(badge()).toBeUndefined()
})

it('retains progress after a failed poll and clears a second tab when the chat is read elsewhere', async () => {
  await render()
  feed = { messages: [shout('new'), shout('old')], hasMore: false }
  await tick()
  vi.mocked(api).mockRejectedValueOnce(new Error('Offline'))
  await tick()
  expect(badge()).toBe('1')
  const archive = createRoot(document.createElement('div'))
  await act(async () => archive.render(createElement(ForumShoutbox, { archive: true })))
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', {key: localStorage.key(0)})) })
  expect(badge()).toBeUndefined()
  await act(async () => archive.unmount())
})

it('keeps arrivals unread while the reader is scrolled back in the open chat', async () => {
  await render()
  await act(async () => launcher().click())
  const list = container.querySelector<HTMLDivElement>('.shoutbox-messages')!
  Object.defineProperties(list, {clientHeight: {value: 250}, scrollHeight: {value: 1000}})
  list.scrollTop = 150
  feed = {messages: [shout('new'), shout('old')], hasMore: false}
  await tick()
  expect(list.scrollTop).toBe(150)
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Minimize Shoutbox 8"]')!.click())
  expect(badge()).toBe('1')
})
