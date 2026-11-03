// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceIncident, DeviceLoad, DiagnosticConsent } from './octatrack-diagnostics-contract'
import type { LinkDiagnostic, OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { LoadReading } from '../engine/elekloader/upload-wire'
const mocked = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn() }))
vi.mock('./api', () => ({ scopedApi: () => ({ current: () => true, request: mocked.request, fetch: mocked.fetch }) }))
vi.mock('./usage', () => ({ browserRequestsPrivacy: () => false, countOctatrackAction: vi.fn() }))
let store: typeof import('./octatrack-diagnostics'), version: string, cleanups: (() => void)[]
const consent = (): DiagnosticConsent => ({ accountId: 'member', enabled: true, version, changedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() })
const sent = () => mocked.fetch.mock.calls.map(call => JSON.parse(String(call[1].body)).data)
const busy = (cause?: unknown) => Object.assign(new Error('busy', { cause }), { retry: true })
let ticks = 0, cpu = 400
const reading = (): LoadReading => ({ ticks: ticks += 1800, frames: ticks, cpu, tracks1to4: 200, tracks5to8: 300, peak1to4: 250, peak5to8: 350 })
const load = (seq: number): DeviceLoad => ({ seq, boot: 1, minute: seq * 5, cpu: [400, 600], dsp1to4: [200, 250], dsp5to8: [300, 350], samples: 600, playing: 300 })
const incident = (seq: number): DeviceIncident => ({ seq, boot: 1, second: seq, kind: 'freeze', a: 0, cpu: 950, dsp1to4: 0, dsp5to8: 0,
  machines: Array(24).fill(0), fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0x400cbf2c, tempo24: 2880, playing: true })
function unit(log = { nonce: 7, boot: 1, seq: 3, loads: [load(1), load(3)], incidents: [incident(2)] }) {
  return { getState: () => ({ status: 'ready', identity: { base: 'a'.repeat(64) }, active: 'b'.repeat(64) }), subscribeDiagnostics: (() => () => {}) as (listener: (event: LinkDiagnostic) => void) => () => void,
    health: vi.fn(async () => undefined), liveLoad: vi.fn(async () => reading()), deviceLog: vi.fn(async () => log) }
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); cleanups = []; ticks = 0; cpu = 400
  version = (await import('./octatrack-diagnostics-contract')).OCTATRACK_DIAGNOSTICS_VERSION
  store = await import('./octatrack-diagnostics')
  mocked.request.mockImplementation(async () => consent())
  mocked.fetch.mockImplementation(async () => Response.json({ stored: true })) // a fresh body each time: a read one throws
  // Node's digest finishes on its thread pool, which fake timers don't wait for: a stand-in that settles at once.
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (_algorithm, data) => {
    const bytes = new Uint8Array(data as ArrayBuffer), out = new Uint8Array(32)
    bytes.forEach((byte, i) => { out[i % 32] = (out[i % 32] * 31 + byte + i) & 255 })
    return out.buffer
  })
})
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); vi.useRealTimers() })
async function collect(link: ReturnType<typeof unit>) {
  cleanups.push(store.collectOctatrackDiagnostics('member', link as unknown as OctatrackLink, () => undefined))
  await vi.advanceTimersByTimeAsync(0)
}
const rounds = (n: number) => vi.advanceTimersByTimeAsync(30_000 * n)

describe('live load and the unit’s own log, with consent', () => {
  it('sends the meters every five minutes and at once when the CPU reaches 90 %', async () => {
    const link = unit(); await collect(link); await rounds(10)
    const loads = sent().filter(data => data.event === 'load')
    expect(loads).toHaveLength(1)
    expect(loads[0]).toMatchObject({ phase: 'ready', base: 'a'.repeat(64), live: { samples: 10, cpu: [400, 400], dsp1to4: [200, 250], dsp5to8: [300, 350] } })
    cpu = 950; await rounds(1)
    expect(sent().filter(data => data.event === 'load').at(-1).live).toMatchObject({ samples: 1, cpu: [950, 950] })
    await rounds(1) // the next hot reading within ten minutes waits for the window
    expect(sent().filter(data => data.event === 'load')).toHaveLength(2)
  })
  it('sends the readings so far before a sync, after it, at a disconnect and when the page closes', async () => {
    let listener!: (event: LinkDiagnostic) => void
    const link = { ...unit(), subscribeDiagnostics: (next: typeof listener) => { listener = next; return () => {} } }
    const emit = async (event: LinkDiagnostic['event']) => { listener({ event, phase: 'ready' }); await vi.advanceTimersByTimeAsync(0) }
    const events = () => sent().map(data => data.event === 'load' ? 'load:' + data.live.samples : data.event)
    await collect(link); await rounds(3)
    expect(events()).not.toContain('load:3')
    await emit('sync_started'); await emit('kept')
    expect(events()).toEqual(expect.arrayContaining(['load:3', 'sync_started', 'kept']))
    expect(events().indexOf('load:3')).toBeLessThan(events().indexOf('sync_started'))
    await rounds(2); await emit('disconnected')
    expect(events().indexOf('load:2')).toBeLessThan(events().indexOf('disconnected'))
    expect(sent().filter(data => data.event === 'load').at(-1)).toMatchObject({ phase: 'ready', base: 'a'.repeat(64), active: 'b'.repeat(64) })
    await rounds(1); window.dispatchEvent(new Event('pagehide')); await vi.advanceTimersByTimeAsync(0)
    expect(events().at(-1)).toBe('load:1')
    expect(mocked.fetch.mock.calls.at(-1)![1]).toMatchObject({ keepalive: true })
  })
  it('says once when the UI tick stands still and when reads fail twice', async () => {
    const link = unit(); await collect(link); await rounds(1)
    link.liveLoad.mockImplementation(async () => ({ ...reading(), ticks: 5 }))
    await rounds(3)
    expect(sent().filter(data => data.event === 'unresponsive')).toEqual([expect.objectContaining({ reason: 'ui' })])
    link.liveLoad.mockImplementation(async () => reading()); await rounds(1)
    link.liveLoad.mockRejectedValue(busy(new Error('stall'))); await rounds(3)
    expect(sent().filter(data => data.event === 'unresponsive').map(data => data.reason)).toEqual(['ui', 'usb'])
    link.liveLoad.mockRejectedValue(busy()); await rounds(3) // another tab holds it: not a failure
    expect(sent().filter(data => data.event === 'unresponsive')).toHaveLength(2)
  })
  it('uploads the unit’s log once, without its nonce, and only what is new', async () => {
    const link = unit(); await collect(link); await rounds(1)
    const logs = sent().filter(data => data.event === 'device_log')
    expect(logs.map(data => [data.log.loads.map((r: DeviceLoad) => r.seq), data.log.incidents.map((r: DeviceIncident) => r.seq)])).toEqual([[[1, 3], []], [[], [2]]])
    expect(logs.every(data => !('modules' in data) && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.id))).toBe(true)
    expect(JSON.stringify(sent())).not.toContain('"nonce"')
    link.deviceLog.mockResolvedValue({ nonce: 7, boot: 2, seq: 4, loads: [load(1), load(3), load(4)], incidents: [incident(2)] })
    await rounds(20)
    expect(sent().filter(data => data.event === 'device_log').at(-1).log).toEqual({ loads: [load(4)], incidents: [] })
  })
  it('sends incidents again when their group failed after a later load group was stored', async () => {
    const incidents = () => sent().filter(data => data.event === 'device_log' && data.log.incidents.length).map(data => data.log.incidents.map((r: DeviceIncident) => r.seq))
    mocked.fetch.mockImplementation(async (_path: string, init: RequestInit) => JSON.parse(String(init.body)).data.log?.incidents.length ? Promise.reject(new Error('offline')) : Response.json({ stored: true }))
    const link = unit(); await collect(link); await rounds(1)
    expect(incidents()).toEqual([[2]])
    mocked.fetch.mockImplementation(async () => Response.json({ stored: true }))
    await rounds(20)
    expect(incidents()).toEqual([[2], [2]])
    await rounds(20) // stored now: not again
    expect(incidents()).toEqual([[2], [2]])
  })
  it('starts from the mark an earlier version kept for both kinds', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('member:7'))
    localStorage.setItem('modwerk.diagnostics.device-log:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), '2')
    await collect(unit()); await rounds(1)
    expect(sent().filter(data => data.event === 'device_log').map(data => data.log)).toEqual([{ loads: [load(3)], incidents: [] }])
  })
})
