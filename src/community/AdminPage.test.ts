// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminPage } from './AdminPage'
import { api } from './api'
import { CommunityContext } from './context'

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), api: vi.fn() }))
const mockApi = vi.mocked(api)
let container: HTMLDivElement, root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  mockApi.mockReset()
  vi.unstubAllGlobals()
})

async function open(route: string, admin = true) {
  const value = { session: { available: true, user: null, admin }, catalog: [], developer: null, refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(AdminPage, { route }))))
}

it('opens only the overview and keeps every tool reachable when counts fail', async () => {
  mockApi.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce({ issues: 7, forum: 0, requests: 2 })
  await open('admin')
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Service unavailable')
  expect(container.querySelectorAll('a[href^="#admin/"]')).toHaveLength(12)
  await act(async () => container.querySelector('button')!.click())
  expect(container.querySelector('[role=alert]')).toBeNull()
  expect(container.querySelector('a[href="#admin/forum"] strong')?.textContent).toBe('0')
  expect(container.querySelector('a[href="#admin/issues"] strong')?.textContent).toBe('7')
  expect(mockApi.mock.calls.map(([path]) => path)).toEqual(['/admin/overview', '/admin/overview'])
})

it('restores the issue filters from the URL and opens the queue on open reports', async () => {
  mockApi.mockResolvedValue([])
  await open('admin/issues?module=tape-echo&status=closed')
  expect(mockApi.mock.lastCall?.[0]).toBe('/admin/issues?status=closed&moduleId=tape-echo')
  const select = container.querySelector<HTMLSelectElement>('.inbox-controls select')!
  expect(select.value).toBe('closed')
  await act(() => container.querySelector<HTMLButtonElement>('.inbox-controls button')!.click())
  expect(window.location.hash).toBe('#admin/issues?status=closed')
  await open('admin/issues')
  expect(mockApi.mock.lastCall?.[0]).toBe('/admin/issues?status=open')
  expect(container.querySelector('.inbox-controls select')).toBe(select)
  expect(select.value).toBe('open')
})

it('guards direct links before mounting a private panel', async () => {
  await open('admin/requests', false)
  expect(container.textContent).toContain('Administrators only')
  expect(container.querySelector('a.button-primary')?.getAttribute('href')).toBe('#account/login?next=admin%2Frequests')
  expect(mockApi).not.toHaveBeenCalled()
})
