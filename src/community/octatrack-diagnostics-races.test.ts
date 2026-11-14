// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagnosticConsent } from './octatrack-diagnostics-contract'
import { diagnosticClient } from './diagnostic-client'
const mocked = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn(), privacy: false, epoch: 0 }))
vi.mock('./api', () => ({ scopedApi: () => {
  const epoch = mocked.epoch
  return { current: () => mocked.epoch === epoch, request: mocked.request, fetch: mocked.fetch }
} }))
vi.mock('./usage', () => ({ browserRequestsPrivacy: () => mocked.privacy, countOctatrackAction: vi.fn() }))
let store: typeof import('./octatrack-diagnostics'), events: typeof import('./site-diagnostic-events'), version: string
let member: string, enabled: boolean, cleanups: (() => void)[]
const consent = (): DiagnosticConsent => ({ accountId: member, enabled, version, changedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() })
const failure = () => ({ event: 'build_failed', buildKind: 'octatrack-base', phase: 'building', error: 'build' }) as const
const flush = () => vi.advanceTimersByTimeAsync(0)
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks(); mocked.privacy = false; mocked.epoch = 0
  member = 'regular-member'; enabled = true; cleanups = []
  version = (await import('./octatrack-diagnostics-contract')).OCTATRACK_DIAGNOSTICS_VERSION
  store = await import('./octatrack-diagnostics'); events = await import('./site-diagnostic-events')
  mocked.request.mockImplementation(async (_path, options?: RequestInit) => {
    if (options?.method === 'PUT') enabled = JSON.parse(String(options.body)).enabled
    return consent()
  })
  mocked.fetch.mockResolvedValue(Response.json({ stored: true }))
})
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); vi.useRealTimers() })
async function collect(inventory = vi.fn(() => undefined)) {
  cleanups.push(store.collectOctatrackDiagnostics(member, null, inventory))
  await flush()
  return inventory
}
function emit() { events.emitSiteDiagnosticEvent(failure(), events.captureSiteDiagnosticContext()) }
async function delayedBody() {
  let finish!: (value: unknown) => void
  const json = vi.fn(() => new Promise(resolve => { finish = resolve }))
  mocked.fetch.mockResolvedValueOnce({ ok: true, status: 200, json } as unknown as Response)
  emit(); await flush(); expect(json).toHaveBeenCalledOnce()
  return finish
}
describe('regular-member collector consent and account boundaries', () => {
  it('keeps sharing under an earlier consent text, asks again only after expiry and keeps the delete button', async () => {
    version = '2026-10-12.2'; await collect()
    expect(store.diagnosticPreference()).toMatchObject({ enabled: true, hasChoice: true, saved: true })
    version = (await import('./octatrack-diagnostics-contract')).OCTATRACK_DIAGNOSTICS_VERSION
    mocked.request.mockResolvedValueOnce({ ...consent(), enabled: false, expiresAt: new Date(Date.now() - 1).toISOString() })
    vi.resetModules(); store = await import('./octatrack-diagnostics'); await collect()
    expect(store.diagnosticPreference()).toMatchObject({ hasChoice: false, saved: true })
  })
  it('sends exact site fields without inventory access or USB metadata when no device is connected', async () => {
    const inventory = await collect()
    emit(); await flush()
    expect(inventory).not.toHaveBeenCalled()
    const body = JSON.parse(String(mocked.fetch.mock.calls[0][1].body))
    // Every report but the unit's own log carries the browser and OS family (2026-11-11.1), nothing more of the user agent.
    expect(body).toEqual({ version, data: { id: expect.any(String), ...failure(), client: diagnosticClient() } })
    window.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE filename.bin https://private.test' })); await flush()
    const browser = JSON.parse(String(mocked.fetch.mock.calls[1][1].body))
    expect(browser).toEqual({ version, data: { id: expect.any(String), event: 'browser_error', phase: 'browser', area: expect.any(String), kind: 'OtherError', client: diagnosticClient() } })
    expect(JSON.stringify(mocked.fetch.mock.calls)).not.toContain('PRIVATE')
  })
  it('removes browser/build collection immediately on withdrawal and does not replay failures after re-enable', async () => {
    await collect()
    await store.changeDiagnosticSharing(false)
    expect(events.captureSiteDiagnosticContext()).toBeUndefined()
    window.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE' })); emit(); await flush()
    expect(mocked.fetch).not.toHaveBeenCalled()
    await store.changeDiagnosticSharing(true); await flush()
    expect(mocked.fetch).not.toHaveBeenCalled()
    emit(); await flush(); expect(mocked.fetch).toHaveBeenCalledOnce()
  })
  it('drops a pending build across real collector account replacement', async () => {
    await collect()
    let reject!: (error: Error) => void
    const original = new Error('PRIVATE old account'), pending = events.observeSiteDiagnosticOperation(() => new Promise<never>((_, fail) => { reject = fail }), failure)
    const result = expect(pending).rejects.toBe(original)
    cleanups[0](); member = 'replacement-member'; ++mocked.epoch; await collect()
    reject(original); await result; await flush()
    expect(mocked.fetch).not.toHaveBeenCalled()
    expect(store.diagnosticPreference().accountId).toBe('replacement-member')
  })
  it('does not update the replacement account from an old response body after its request headers arrived', async () => {
    await collect(); const finish = await delayedBody()
    cleanups[0](); member = 'replacement-member'; ++mocked.epoch; await collect()
    expect(store.diagnosticPreference().lastSent).toBeNull()
    finish({ stored: true }); await flush()
    expect(store.diagnosticPreference()).toMatchObject({ accountId: 'replacement-member', lastSent: null })
  })
  it('does not restore lastSent from a delayed body after withdrawal deletes the reports', async () => {
    await collect(); const finish = await delayedBody()
    await store.changeDiagnosticSharing(false)
    expect(store.diagnosticPreference()).toMatchObject({ enabled: false, lastSent: null })
    finish({ stored: true }); await flush()
    expect(store.diagnosticPreference()).toMatchObject({ enabled: false, lastSent: null })
  })
  it('never starts or keeps collection when the browser privacy preference is active', async () => {
    mocked.privacy = true; await collect()
    expect(events.captureSiteDiagnosticContext()).toBeUndefined()
    expect(await store.changeDiagnosticSharing(true)).toBe(false)
    window.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE' })); emit(); await flush()
    expect(mocked.fetch).not.toHaveBeenCalled()
  })
  it('does not collect a build started while privacy was active even if privacy changes before the next poll', async () => {
    await collect(); mocked.privacy = true
    let reject!: (error: Error) => void
    const original = new Error('PRIVATE'), pending = events.observeSiteDiagnosticOperation(() => new Promise<never>((_, fail) => { reject = fail }), failure)
    const result = expect(pending).rejects.toBe(original)
    mocked.privacy = false; reject(original); await result; await flush()
    expect(mocked.fetch).not.toHaveBeenCalled()
  })
})
