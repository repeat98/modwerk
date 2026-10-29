// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentBoard, type BoardClaim } from './AgentBoard'
import { CommunityContext, emptySession } from './context'

const calls = vi.hoisted(() => [] as { path: string; method?: string }[])
const claims = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('./api', () => ({ api: vi.fn(async (path: string, options: RequestInit = {}) => { calls.push({ path, method: options.method }); return { claims: claims.value } }) }))
let root: Root, container: HTMLDivElement
const claim = (values: Partial<BoardClaim>): BoardClaim => ({ id: crypto.randomUUID(), kind: 'module', key: 'octatrack/tape-echo', holder: 'ada', branch: 'module/tape-echo', pullRequest: null, note: '', createdAt: '2026-10-29T10:00:00.000Z', expiresAt: '2026-11-12T10:00:00.000Z', ...values })
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (admin: boolean) => act(async () => root.render(createElement(CommunityContext.Provider, { value: { session: { ...emptySession, admin }, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(AgentBoard, { repository: 'https://github.com/repeat98/modwerk' }))))

it('lists who holds what, with the pull request once there is one', async () => {
  claims.value = [claim({ note: 'Porting the BBD echo' }), claim({ kind: 'hook', key: 'octatrack/39', holder: 'bo', pullRequest: 1200, expiresAt: null })]
  await render(false)
  const text = container.textContent!
  expect(calls[0]).toEqual({ path: '/agent-board/claims', method: undefined })
  expect(text).toContain('octatrack/tape-echo'); expect(text).toContain('@ada'); expect(text).toContain('module/tape-echo'); expect(text).toContain('Porting the BBD echo')
  expect(text).toContain('Hook or table'); expect(text).toContain('while its pull request is open')
  expect(container.querySelector('a[href="https://github.com/repeat98/modwerk/pull/1200"]')).not.toBeNull()
  expect([...container.querySelectorAll('button')].map(button => button.textContent)).toEqual([])
})

it('gives administrators a Release button that asks first', async () => {
  claims.value = [claim({})]
  await render(true)
  vi.stubGlobal('confirm', vi.fn(() => true))
  const release = [...container.querySelectorAll('button')].find(button => button.textContent === 'Release')!
  await act(async () => { release.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(calls.map(call => call.method ?? 'GET')).toEqual(['GET', 'DELETE', 'GET'])
  expect(calls[1].path).toMatch(/^\/agent-board\/claims\/[0-9a-f-]{36}$/)
})

it('says when nobody holds anything', async () => {
  claims.value = []
  await render(false)
  expect(container.textContent).toContain('No claims right now.')
})
