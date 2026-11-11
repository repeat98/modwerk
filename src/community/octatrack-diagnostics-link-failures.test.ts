import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkDiagnostic, LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { collectOctatrackDiagnostics, changeDiagnosticSharing, reportLinkFailure } from './octatrack-diagnostics'
import { api, apiFetch, post } from './api'
import { OCTATRACK_DIAGNOSTICS_VERSION as version } from './octatrack-diagnostics-contract'
import { diagnosticClient } from './diagnostic-client'
vi.mock('./api', () => {
  const api = vi.fn(), apiFetch = vi.fn(), post = vi.fn()
  return { api, apiFetch, post, scopedApi: () => ({ current: () => true, request: (path: string, options?: RequestInit) => options?.method === 'PUT' ? post(path, JSON.parse(String(options.body)), 'PUT') : api(path, options), fetch: apiFetch }) }
})
vi.mock('./usage', () => ({ browserRequestsPrivacy: () => false, countOctatrackAction: vi.fn() }))
let cleanup: undefined | (() => void), enabled = false, state: LinkState
const listeners = new Set<() => void>()
const consent = () => ({ accountId: 'member', enabled, version, changedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() })
let forward: ((event: LinkDiagnostic) => void) | undefined
const link = { subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, subscribeDiagnostics: (listener: (event: LinkDiagnostic) => void) => { forward = listener; return () => { forward = undefined } }, getState: () => state } as unknown as OctatrackLink
const move = async (next: LinkState) => { state = next; listeners.forEach(listener => listener()); await vi.advanceTimersByTimeAsync(0) }
const sent = () => vi.mocked(apiFetch).mock.calls.map(([, options]) => JSON.parse(String(options!.body)).data)
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); enabled = false; state = { status: 'idle' }; listeners.clear()
  vi.mocked(api).mockImplementation(async () => consent() as never)
  vi.mocked(post).mockImplementation(async (_path, body) => { enabled = (body as { enabled: boolean }).enabled; return consent() as never })
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ ok: true, stored: true }))
})
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers() })
async function collect() { cleanup = collectOctatrackDiagnostics('member', link, () => ({ moduleIds: ['everb'], removedStockFx: [] })); await vi.advanceTimersByTimeAsync(0) }

describe('failures before a link exists', () => {
  it('sends nothing without consent', async () => {
    await collect()
    await move({ status: 'connecting' }); await move({ status: 'busy' })
    reportLinkFailure('no-device')
    await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).not.toHaveBeenCalled()
  })
  it('records a device that couldn’t be opened or claimed from the link’s state, and reasons reported by the page, as fixed categories', async () => {
    await collect(); await changeDiagnosticSharing(true)
    await move({ status: 'connecting' }); await move({ status: 'busy' })
    await move({ status: 'connecting' }); await move({ status: 'idle', notice: { tone: 'error', text: 'Chrome couldn’t open the Octatrack.' } })
    await move({ status: 'connecting' }); await move({ status: 'stock' }) // the original OS is no failure
    reportLinkFailure('no-device'); reportLinkFailure('no-webusb'); await vi.advanceTimersByTimeAsync(0)
    expect(sent()).toEqual([
      { id: expect.any(String), event: 'link_failed', phase: 'busy', failure: 'claim-failed', client: diagnosticClient() },
      { id: expect.any(String), event: 'link_failed', phase: 'idle', failure: 'open-failed', client: diagnosticClient() },
      { id: expect.any(String), event: 'link_failed', phase: 'stock', failure: 'no-device', client: diagnosticClient() },
      { id: expect.any(String), event: 'link_failed', phase: 'stock', failure: 'no-webusb', client: diagnosticClient() },
    ])
    expect(JSON.stringify(sent())).not.toContain('Chrome couldn')
  })
  it('records each category at most once in ten minutes, and permission-denied stands for the open failure it causes', async () => {
    await collect(); await changeDiagnosticSharing(true)
    reportLinkFailure('permission-denied')
    await move({ status: 'connecting' }); await move({ status: 'idle', notice: { tone: 'error', text: 'x' } })
    reportLinkFailure('permission-denied'); await vi.advanceTimersByTimeAsync(0)
    expect(sent().map(data => data.failure)).toEqual(['permission-denied'])
    await vi.advanceTimersByTimeAsync(600_000)
    reportLinkFailure('permission-denied'); await vi.advanceTimersByTimeAsync(0)
    expect(sent().map(data => data.failure)).toEqual(['permission-denied', 'permission-denied'])
  })
  it('takes the same report from the link itself, through the same once-in-ten-minutes rule', async () => {
    await collect(); await changeDiagnosticSharing(true)
    forward!({ event: 'link_failed', phase: 'idle', failure: 'no-device' }); reportLinkFailure('no-device'); await vi.advanceTimersByTimeAsync(0)
    expect(sent()).toEqual([{ id: expect.any(String), event: 'link_failed', phase: 'idle', failure: 'no-device', client: diagnosticClient() }])
  })
  it('does nothing once the collector has stopped', async () => {
    await collect(); await changeDiagnosticSharing(true)
    cleanup!(); cleanup = undefined
    reportLinkFailure('link-timeout'); await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
