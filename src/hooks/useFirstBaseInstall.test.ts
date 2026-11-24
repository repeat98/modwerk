// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFirstBaseInstall } from './useBaseInstallPrompt'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { publishedBinding as baseBinding } from '../engine/elekloader/published-octatrack.fixture'
import { rememberInventory } from '../config/inventory'

const mocked = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }))
vi.mock('../community/api', () => ({ api: mocked.api, post: mocked.post }))
let root: Root, container: HTMLDivElement, prompt: ReturnType<typeof useFirstBaseInstall>
function unit(state: LinkState) {
  const listeners = new Set<() => void>()
  const link = { getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } } as unknown as OctatrackLink
  return { link, update(next: LinkState) { state = next; listeners.forEach(fn => fn()) } }
}
function Harness({ link, member = 'member' }: { link: OctatrackLink; member?: string | null }) {
  const current = useFirstBaseInstall(member, link)
  useEffect(() => { prompt = current }, [current])
  return null
}
const render = (link: OctatrackLink, options: { member?: string | null } = {}) => act(async () => { root.render(createElement(Harness, { link, ...options })); await Promise.resolve() })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.clearAllMocks()
  mocked.api.mockResolvedValue({ show: true }); mocked.post.mockResolvedValue({})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

it('introduces a stock unit even when a member has used another base', async () => {
  mocked.api.mockResolvedValue({ show: false })
  await render(unit({ status: 'stock' }).link)
  expect(prompt).toBe(true)
})
it('records a connected base and remembers it after unplugging', async () => {
  const device = unit({ status: 'connecting' })
  await render(device.link)
  await act(async () => device.update({ status: 'ready', identity: { base: baseBinding.identity, canSubmit: true, model: 'OT' } }))
  expect(prompt).toBe(false)
  expect(mocked.post).toHaveBeenCalledWith('/auth/base-install-prompt', {})
  await act(async () => device.update({ status: 'idle' }))
  expect(prompt).toBe(false)
  expect(mocked.post).toHaveBeenCalledTimes(1)
})
it('uses account history while disconnected and browser inventory for a visitor', async () => {
  mocked.api.mockResolvedValue({ show: false })
  const device = unit({ status: 'idle' })
  await render(device.link)
  expect(prompt).toBe(false)
  await render(device.link, { member: null })
  expect(prompt).toBe(true)
  await act(() => root.unmount()); root = createRoot(container)
  rememberInventory(baseBinding.identity, { moduleIds: [], removedStockFx: [] })
  await render(device.link, { member: null })
  expect(prompt).toBe(false)
})
