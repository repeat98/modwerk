import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLazyFirmwareClient, createObservedDigiFirmwareClient } from './firmware-client'
import { subscribeSiteDiagnosticEvents } from '../community/site-diagnostic-events'
import type { EngineRequest, EngineResponse } from '../engine/protocol'
class FakeWorker {
  static created: FakeWorker[] = []
  posted: EngineRequest[] = []
  terminated = false
  onmessage: ((event: { data: EngineResponse }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() { FakeWorker.created.push(this) }
  postMessage(request: EngineRequest) { this.posted.push(request) }
  terminate() { this.terminated = true }
  reply(response: EngineResponse) { this.onmessage?.({ data: response }) }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
beforeEach(() => { FakeWorker.created = []; vi.stubGlobal('Worker', FakeWorker) })
afterEach(() => { vi.unstubAllGlobals() })
describe('lazy firmware client', () => {
  it('starts the worker on the first request, not when the page loads, and refuses requests after dispose', async () => {
    const client = createLazyFirmwareClient()
    expect(FakeWorker.created).toHaveLength(0)
    const built = client.buildBase()
    await flush()
    expect(FakeWorker.created).toHaveLength(1)
    const worker = FakeWorker.created[0]
    expect(worker.posted[0]).toMatchObject({ type: 'base' })
    worker.reply({ id: worker.posted[0].id, type: 'base', buffer: new ArrayBuffer(1), sha256: 'a', base: 'b' })
    await expect(built).resolves.toMatchObject({ sha256: 'a', base: 'b' })
    client.dispose()
    expect(worker.terminated).toBe(true)
    await expect(Promise.resolve().then(() => client.buildBase())).rejects.toThrow('closed')
  })
})


describe('safe Digi reader observations', () => {
  it('keeps the existing eager reader, exact inputs and rejection while recording only a fixed category', async () => {
    const original = new Error('PRIVATE.syx'), inspect = vi.fn(() => Promise.reject(original)), dispose = vi.fn(), create = vi.fn(() => ({ inspect, dispose }))
    const receive = vi.fn(), stop = subscribeSiteDiagnosticEvents(receive), file = new File(['PRIVATE'], 'PRIVATE.syx')
    const client = createObservedDigiFirmwareClient(create)
    try {
      expect(create).toHaveBeenCalledTimes(1)
      await expect(client.inspect('digitakt', file)).rejects.toBe(original)
      expect(inspect).toHaveBeenCalledWith('digitakt', file)
      expect(receive).toHaveBeenCalledWith({ event: 'build_failed', phase: 'preparing', buildKind: 'elekloader', error: 'input' })
    } finally { client.dispose(); stop() }
    expect(dispose).toHaveBeenCalledTimes(1)
  })
  it('does not report a pending reader disposed by a page change', async () => {
    let reject!: (error: Error) => void
    const original = new Error('PRIVATE reader disposed'), receive = vi.fn(), stop = subscribeSiteDiagnosticEvents(receive)
    const client = createObservedDigiFirmwareClient(() => ({ inspect: () => new Promise((_, fail) => { reject = fail }), dispose: () => reject(original) }))
    try {
      const pending = client.inspect('digitakt', new File(['PRIVATE'], 'PRIVATE.syx')), failed = expect(pending).rejects.toBe(original)
      client.dispose(); await failed
      expect(receive).not.toHaveBeenCalled()
    } finally { stop() }
  })
})
