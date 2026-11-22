// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentBoard, type BoardActivity, type BoardClaim, type BoardThread } from './AgentBoard'
import { CommunityContext, emptySession } from './context'

const calls = vi.hoisted(() => [] as { path: string; method?: string; body?: unknown }[])
const board = vi.hoisted(() => ({ claims: [] as unknown[], released: [] as unknown[], messages: [] as unknown[] | null, ended: [] as unknown[], activity: null as unknown }))
vi.mock('./api', () => {
  const answer = async (path: string, options: RequestInit = {}) => {
    calls.push({ path, method: options.method, body: options.body })
    if (path.startsWith('/agent-board/messages') && !options.method) { if (!board.messages) throw new Error('API route not found.'); return { messages: board.messages, ended: board.ended } }
    if (path === '/agent-board/activity') { if (!board.activity) throw new Error('API route not found.'); return board.activity }
    return { claims: board.claims, released: board.released }
  }
  return { api: vi.fn(answer), post: vi.fn((path: string, body: unknown) => answer(path, { method: 'POST', body: body as BodyInit })) }
})
let root: Root, container: HTMLDivElement
const claim = (values: Partial<BoardClaim>): BoardClaim => ({ id: crypto.randomUUID(), kind: 'module', key: 'octatrack/tape-echo', holder: 'ada', branch: 'module/tape-echo', pullRequest: null, note: '', createdAt: '2026-10-29T10:00:00.000Z', expiresAt: '2026-11-12T10:00:00.000Z', ...values })
const thread = (values: Partial<BoardThread>): BoardThread => ({ id: crypto.randomUUID(), kind: 'question', topic: { kind: 'module', key: 'octatrack/tape-echo' }, author: 'bo', to: 'ada', body: 'Room for a chorus stage?', pullRequest: null, createdAt: '2026-10-30T10:00:00.000Z', endsAt: '2026-11-29T10:00:00.000Z', replies: [], ...values })
const activity: BoardActivity = { days: 30, developers: { signedIn: 4, active: 3 }, claims: { active: 2, made: 5 }, questions: { open: 1 }, findings: { active: 1 }, posts: 1 }
beforeEach(() => {
  calls.length = 0
  Object.assign(board, { claims: [], released: [], messages: [], ended: [], activity: null })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (admin: boolean) => act(async () => root.render(createElement(CommunityContext.Provider, { value: { session: { ...emptySession, admin }, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(AgentBoard, { repository: 'https://github.com/repeat98/modwerk' }))))
const buttons = () => [...container.querySelectorAll('button')]

it('lists who holds what, with the pull request once there is one', async () => {
  board.claims = [claim({ note: 'Porting the BBD echo' }), claim({ kind: 'hook', key: 'octatrack/39', holder: 'bo', pullRequest: 1200, expiresAt: null })]
  await render(false)
  const text = container.textContent!
  expect(calls.map(call => call.path)).toEqual(['/agent-board/claims?released=1', '/agent-board/messages?ended=1', '/agent-board/activity'])
  expect(text).toContain('octatrack/tape-echo'); expect(text).toContain('@ada'); expect(text).toContain('module/tape-echo'); expect(text).toContain('Porting the BBD echo')
  expect(text).toContain('Hook or table'); expect(text).toContain('while its pull request is open')
  expect(container.querySelector('a[href="https://github.com/repeat98/modwerk/pull/1200"]')).not.toBeNull()
  expect(buttons().map(button => button.textContent)).toEqual([])
})

it('shows questions and findings with their replies, recently ended claims and how many developers use the board', async () => {
  board.messages = [thread({ replies: [{ id: crypto.randomUUID(), author: 'ada', body: 'Yes, go ahead.', createdAt: '2026-10-30T11:00:00.000Z' }] }), thread({ kind: 'finding', topic: { kind: 'machine', key: 'octatrack' }, to: null, body: 'Loads go to RAM.', pullRequest: 1400 })]
  board.released = [claim({ key: 'octatrack/old-echo', releasedAt: '2026-10-20T10:00:00.000Z', releasedReason: 'merged', pullRequest: 900 })]
  board.activity = activity
  await render(false)
  const text = container.textContent!
  expect(text).toContain('Questions and findings'); expect(text).toContain('@bo to @ada'); expect(text).toContain('Room for a chorus stage?'); expect(text).toContain('Yes, go ahead.')
  expect(text).toContain('Finding'); expect(text).toContain('folds into a guide in #1400')
  expect(text).toContain('Recently ended claims (1)'); expect(text).toContain('merged')
  expect(container.querySelector('[aria-label="Board activity"]')!.textContent).toBe('4 developers signed in from the terminal · 3 active in the last 30 days · 5 claims and 1 post in that time')
})

it('hides the parts an older Worker does not answer', async () => {
  board.claims = [claim({})]; board.messages = null
  await render(false)
  expect(container.textContent).not.toContain('Questions and findings')
  expect(container.querySelector('[aria-label="Board activity"]')).toBeNull()
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('gives administrators Release, Close and Delete buttons that ask first', async () => {
  board.claims = [claim({})]; board.messages = [thread({})]
  await render(true)
  vi.stubGlobal('confirm', vi.fn(() => true))
  expect(buttons().map(button => button.textContent)).toEqual(['Release', 'Close', 'Delete'])
  for (const name of ['Release', 'Close', 'Delete']) await act(async () => { buttons().find(button => button.textContent === name)!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const writes = calls.filter(call => call.method)
  expect(writes.map(call => call.method)).toEqual(['DELETE', 'POST', 'DELETE'])
  expect(writes[0].path).toMatch(/^\/agent-board\/claims\/[0-9a-f-]{36}$/)
  expect(writes[1].path).toMatch(/^\/agent-board\/messages\/[0-9a-f-]{36}\/close$/)
  expect(writes[2].path).toMatch(/^\/agent-board\/messages\/[0-9a-f-]{36}$/)
})

it('shows wanted tasks as a to-do board with their priority and who took or finished them, and lets administrators reprioritise', async () => {
  const task = (values: Partial<BoardThread>) => thread({ kind: 'wanted', topic: { kind: 'site', key: 'forum' }, to: null, priority: 'normal', ...values })
  board.messages = [task({ body: 'Fix broken thread links.', priority: 'high' }), task({ body: 'Show versions.', to: 'cy' }), task({ body: 'Tidy the footer.', to: 'bo', pullRequest: 1700, priority: 'low' }), thread({})]
  board.ended = [task({ body: 'Count replies.', to: 'ada', pullRequest: 1600, endedAt: '2026-11-10T10:00:00.000Z', endedReason: 'merged' }), task({ body: 'Lapsed.', endedAt: '2026-11-10T10:00:00.000Z', endedReason: 'expired' })]
  await render(true)
  const column = (name: string) => container.querySelector(`[aria-label="${name}"]`)!.textContent!
  expect(column('To do')).toContain('High'); expect(column('To do')).toContain('Fix broken thread links.'); expect(column('To do')).toContain('posted by @bo')
  expect(column('Taken')).toContain('taken by @cy')
  expect(column('In review')).toContain('Low'); expect(column('In review')).toContain('#1700')
  expect(column('Done')).toContain('done by @ada'); expect(column('Done')).not.toContain('Lapsed.')
  expect(container.querySelector('summary')!.textContent).toContain('1 to-do · ')
  // The question stays under Questions and findings, not on the to-do board.
  expect(container.textContent).toContain('Room for a chorus stage?')
  // Only open tasks get a priority control, and only for administrators.
  expect(container.querySelectorAll('select')).toHaveLength(3)
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Priority of forum"]')!
  await act(async () => { select.value = 'low'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(calls.find(call => call.body)).toMatchObject({ path: expect.stringMatching(/^\/agent-board\/messages\/[0-9a-f-]{36}\/priority$/), body: { priority: 'low' } })
  await render(false)
  expect(container.querySelector('select')).toBeNull()
})

it('filters sibling tasks across columns and links independent evidence', async () => {
  const task = (body: string, parentIssue: number, to: string | null) => thread({ kind: 'wanted', body, parentIssue, to, pullRequest: null })
  board.messages = [task('Trace saving.', 42, null), task('Trace loading.', 42, 'cy'), task('Check another issue.', 43, null),
    thread({ kind: 'finding', replies: [{ id: 'result', author: 'cy', body: 'Only on reload.', createdAt: '', outcome: 'different-result', evidence: 345 }] })]
  await render(false)
  const button = (label: string) => [...container.querySelectorAll('button')].find(el => el.textContent === label)!
  await act(async () => { button('Issue #42').click() })
  expect(container.textContent).toContain('Trace saving.')
  expect(container.textContent).toContain('Trace loading.')
  expect(container.textContent).not.toContain('Check another issue.')
  expect(container.querySelector('a[href$="/issues/345"]')?.textContent).toBe('Evidence #345')
  await act(async () => { button('Show all tasks').click() })
  expect(container.textContent).toContain('Check another issue.')
})

it('says when nobody holds anything', async () => {
  await render(false)
  expect(container.textContent).toContain('No claims right now.')
})
