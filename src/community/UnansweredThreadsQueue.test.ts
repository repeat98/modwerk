// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnansweredThreadsQueue } from './UnansweredThreadsQueue'
import type { UnansweredThreadsPage } from './admin-activity-contract'
const mock = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('./api', () => ({ api: mock.api }))
const threads = Array.from({ length: 10 }, (_, i) => ({ id: 'thread-' + i, title: 'Waiting ' + i, createdAt: '2026-10-01 00:00:00' }))
const initial = { total: 12, threads }
const page = (values: Partial<UnansweredThreadsPage> = {}): UnansweredThreadsPage => ({ ...initial, page: 1, pageSize: 10, category: 'all', order: 'oldest', generatedAt: '2026-10-27T10:00:00Z', ...values })
let root: Root, container: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mock.api.mockReset()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(createElement(UnansweredThreadsQueue, { initial, generatedAt: '2026-10-27T10:00:00Z' })) })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const button = (text: string) => [...container.querySelectorAll('button')].find(node => node.textContent === text)!
async function select(index: number, value: string) { await act(async () => { const node = container.querySelectorAll('select')[index]; node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })) }) }

describe('first-reply queue controls', () => {
  it('starts from the activity response and loads subsequent pages without the charts', async () => {
    expect(mock.api).not.toHaveBeenCalled()
    expect(button('Previous discussions').disabled).toBe(true)
    mock.api.mockResolvedValue(page({ page: 2, threads: [{ ...threads[0], id: 'last', title: 'Last waiting discussion' }] }))
    await act(async () => button('Next discussions').click())
    expect(mock.api).toHaveBeenCalledWith('/admin/unanswered-threads?page=2&category=all&order=oldest', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(container.textContent).toContain('Last waiting discussion')
    expect(container.textContent).toContain('page 2 of 2')
    expect(button('Next discussions').disabled).toBe(true)
    expect(container.querySelector('a')?.href).toContain('/forum/thread/last/')
  })
  it('resets pagination on a category change and retries failures without showing stale threads', async () => {
    mock.api.mockResolvedValueOnce(page({ page: 2 }))
    await act(async () => button('Next discussions').click())
    mock.api.mockRejectedValueOnce(new Error('Offline'))
    await select(0, 'requests')
    expect(mock.api.mock.calls.at(-1)?.[0]).toBe('/admin/unanswered-threads?page=1&category=requests&order=oldest')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Offline')
    expect(container.querySelectorAll('a')).toHaveLength(0)
    mock.api.mockResolvedValueOnce(page({ category: 'requests', total: 0, threads: [] }))
    await act(async () => button('Refresh first-reply list').click())
    expect(mock.api.mock.calls.at(-1)?.[0]).toContain('page=1&category=requests')
    expect(container.textContent).toContain('No open threads in this category')
  })
  it('aborts replaced requests and ignores their late results', async () => {
    let resolve!: (value: UnansweredThreadsPage) => void
    mock.api.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await select(0, 'showcase')
    const signal = mock.api.mock.calls[0][1].signal as AbortSignal
    mock.api.mockResolvedValueOnce(page({ category: 'showcase', order: 'newest', total: 1, threads: [{ ...threads[0], title: 'Current result' }] }))
    await select(1, 'newest')
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(page({ threads: [{ ...threads[0], title: 'Stale result' }] })))
    expect(container.textContent).toContain('Current result')
    expect(container.textContent).not.toContain('Stale result')
  })
})
