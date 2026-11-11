// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useBaseInstallPrompt } from './useBaseInstallPrompt'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { rememberInventory } from '../config/inventory'

const mocked = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }))
vi.mock('../community/api', () => ({ api: mocked.api, post: mocked.post }))
let root: Root, container: HTMLDivElement, prompt: ReturnType<typeof useBaseInstallPrompt>
function unit(state: LinkState) {
  const listeners = new Set<() => void>()
  const link = { getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } } as unknown as OctatrackLink
  return { link, update(next: LinkState) { state = next; listeners.forEach(fn => fn()) } }
}
function Harness({ link, member = 'member', installHere = true }: { link: OctatrackLink; member?: string | null; installHere?: boolean }) {
  const current = useBaseInstallPrompt(member, true, link, installHere)
  useEffect(() => { prompt = current }, [current])
  return null
}
const render = (link: OctatrackLink, options: { member?: string | null; installHere?: boolean } = {}) => act(async () => { root.render(createElement(Harness, { link, ...options })); await Promise.resolve() })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.clearAllMocks()
  mocked.api.mockResolvedValue({ show: true }); mocked.post.mockResolvedValue({})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

it('opens the install prompt for a unit on the original OS', async () => {
  await render(unit({ status: 'stock' }).link)
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(prompt.update).toBe(false); expect(mocked.post).not.toHaveBeenCalled()
})
it('stays closed without a unit once the member has had a base', async () => {
  mocked.api.mockResolvedValue({ show: false })
  await render(unit({ status: 'idle' }).link)
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false); expect(mocked.post).not.toHaveBeenCalled()
})
it('waits while the unit is read, records the current base, and stays closed after it is unplugged', async () => {
  const device = unit({ status: 'connecting' })
  await render(device.link)
  await act(() => vi.advanceTimersByTimeAsync(6000)); expect(prompt.open).toBe(false)
  await act(async () => device.update({ status: 'ready', identity: { base: baseBinding.identity, canSubmit: true, model: 'OT' } }))
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false); expect(mocked.post).toHaveBeenCalledWith('/auth/base-install-prompt', {})
  await act(async () => device.update({ status: 'idle' }))
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false); expect(mocked.post).toHaveBeenCalledTimes(1)
})
it('records an older base as installed and opens the update prompt, even when the install prompt is not due', async () => {
  await render(unit({ status: 'ready', identity: { base: 'a'.repeat(64), canSubmit: true, model: 'OT' } }).link)
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(prompt.update).toBe(true); expect(mocked.post).toHaveBeenCalledTimes(1)
  await act(async () => prompt.close())
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false)
})
it('opens the update prompt for a base this page cannot talk to', async () => {
  mocked.api.mockResolvedValue({ show: false })
  await render(unit({ status: 'ready' }).link)
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(prompt.update).toBe(true); expect(mocked.post).not.toHaveBeenCalled()
})

// The guide is the Your Octatrack page's (installHere): the unit is the authority, the account or this browser a hint.
it('opens the install guide only on the Your Octatrack page; the update prompt anywhere', async () => {
  await render(unit({ status: 'stock' }).link, { installHere: false })
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false)
  await render(unit({ status: 'ready', identity: { base: 'a'.repeat(64), canSubmit: true, model: 'OT' } }).link, { installHere: false })
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(prompt.update).toBe(true)
})
it('opens the guide for a unit on the original OS even when the account says it had a base', async () => {
  mocked.api.mockResolvedValue({ show: false })
  await render(unit({ status: 'stock' }).link)
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(prompt.update).toBe(false)
})
it('opens no guide in a browser without WebUSB, where the card build is the way', async () => {
  await render(unit({ status: 'unsupported' }).link)
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false)
})
it('opens the guide once for a visitor, and not where this browser has read a unit with a base', async () => {
  await render(unit({ status: 'idle' }).link, { member: null })
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(prompt.open).toBe(true); expect(mocked.api).not.toHaveBeenCalled()
  await act(async () => prompt.close())
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false) // Later: gone for this visit
  await act(() => root.unmount()); root = createRoot(container)
  rememberInventory(baseBinding.identity, { moduleIds: [], removedStockFx: [] })
  await render(unit({ status: 'idle' }).link, { member: null })
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(prompt.open).toBe(false)
})
