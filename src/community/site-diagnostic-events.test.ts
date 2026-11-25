// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteDiagnosticEvent } from './octatrack-diagnostics-contract'
import { captureSiteDiagnosticContext, collectBrowserDiagnosticEvents, emitSiteDiagnosticEvent, observeSiteDiagnosticOperation, subscribeSiteDiagnosticEvents } from './site-diagnostic-events'
let cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); cleanups = [] })
function subscribe() { const receive = vi.fn(); cleanups.push(subscribeSiteDiagnosticEvents(receive)); return receive }
const failed = () => ({ event: 'build_failed', phase: 'building', buildKind: 'octatrack-base', error: 'build' }) as const
function rejection(target: EventTarget, promise: Promise<unknown>, reason: unknown) {
  const event = new Event('unhandledrejection', { cancelable: true })
  Object.defineProperties(event, { promise: { value: promise }, reason: { value: reason } }); target.dispatchEvent(event)
  return event
}
describe('consent-bound fixed site diagnostics', () => {
  it('has no pre-consent history and returns the original pre-consent promise', async () => {
    const promise = Promise.resolve('unchanged')
    expect(observeSiteDiagnosticOperation(() => promise, failed)).toBe(promise)
    emitSiteDiagnosticEvent(failed(), captureSiteDiagnosticContext())
    const receive = subscribe()
    expect(await promise).toBe('unchanged'); expect(receive).not.toHaveBeenCalled()
  })
  it('emits only the fixed event projection, dropping private extras and invalid enums', () => {
    const receive = subscribe(), context = captureSiteDiagnosticContext()
    emitSiteDiagnosticEvent({ ...failed(), filename: 'PRIVATE.bin', message: 'PRIVATE', stack: 'PRIVATE', bytes: Uint8Array.of(9) } as SiteDiagnosticEvent, context)
    expect(receive).toHaveBeenCalledWith(failed())
    emitSiteDiagnosticEvent({ ...failed(), phase: 'PRIVATE' } as unknown as SiteDiagnosticEvent, context)
    expect(receive).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(receive.mock.calls)).not.toContain('PRIVATE')
  })
  it('preserves synchronous throws and rejection objects even if the collector fails', async () => {
    cleanups.push(subscribeSiteDiagnosticEvents(() => { throw new Error('collector failure') }))
    const original = new Error('PRIVATE /file.bin https://secret.test')
    try { observeSiteDiagnosticOperation(() => { throw original }, failed); expect.fail('expected synchronous throw') } catch (error) { expect(error).toBe(original) }
    await expect(observeSiteDiagnosticOperation(() => Promise.reject(original), failed)).rejects.toBe(original)
    const result = { buffer: new ArrayBuffer(4) }
    expect(await observeSiteDiagnosticOperation(() => Promise.resolve(result), failed)).toBe(result)
  })
  it('drops failures started before consent or under a replaced account, including browser fallback', async () => {
    let rejectBefore!: (error: Error) => void, rejectOld!: (error: Error) => void
    const before = observeSiteDiagnosticOperation(() => new Promise<never>((_, reject) => { rejectBefore = reject }), failed)
    const first = subscribe()
    const old = observeSiteDiagnosticOperation(() => new Promise<never>((_, reject) => { rejectOld = reject }), failed)
    const second = subscribe(), target = new EventTarget()
    cleanups.push(collectBrowserDiagnosticEvents(target))
    const secret = new Error('PRIVATE')
    const beforeResult = expect(before).rejects.toBe(secret), oldResult = expect(old).rejects.toBe(secret)
    rejectBefore(secret); rejectOld(secret); await Promise.all([beforeResult, oldResult])
    rejection(target, before, secret); rejection(target, old, secret)
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled()
  })
  it('never installs browser listeners without consent and removes them when collection stops', () => {
    const target = new EventTarget(), add = vi.spyOn(target, 'addEventListener'), remove = vi.spyOn(target, 'removeEventListener')
    collectBrowserDiagnosticEvents(target)(); expect(add).not.toHaveBeenCalled()
    const receive = subscribe(), stop = collectBrowserDiagnosticEvents(target)
    expect(add).toHaveBeenCalledTimes(2); stop(); expect(remove).toHaveBeenCalledTimes(2)
    target.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE' })); expect(receive).not.toHaveBeenCalled()
  })
  it('does not read or retain browser messages, URLs or stacks and leaves browser handling unchanged', () => {
    const receive = subscribe(), target = new EventTarget(); cleanups.push(collectBrowserDiagnosticEvents(target))
    const error = new Error('PRIVATE'), event = new ErrorEvent('error', { error, filename: 'PRIVATE', message: 'PRIVATE', cancelable: true })
    target.dispatchEvent(event)
    const unhandled = rejection(target, Promise.resolve(), error)
    expect(receive.mock.calls).toEqual([[{ event: 'browser_error', phase: 'browser', area: 'library', kind: 'OtherError' }], [{ event: 'unhandled_rejection', phase: 'browser', area: 'library', kind: 'OtherError' }]])
    expect(event.defaultPrevented).toBe(false); expect(unhandled.defaultPrevented).toBe(false)
  })
  it('tells an error without an error object (a cross-origin or extension script) from a real throw', () => {
    const receive = subscribe(), target = new EventTarget(); cleanups.push(collectBrowserDiagnosticEvents(target))
    target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' })); rejection(target, Promise.resolve(), undefined)
    target.dispatchEvent(new ErrorEvent('error', { error: new TypeError('PRIVATE') }))
    expect(receive.mock.calls.map(([event]) => event.kind)).toEqual(['NoErrorObject', 'NoErrorObject', 'TypeError'])
  })
  it('omits expected aborts and cancelled builds, including their unhandled fallback', async () => {
    const receive = subscribe(), target = new EventTarget(); cleanups.push(collectBrowserDiagnosticEvents(target))
    const abort = new DOMException('PRIVATE', 'AbortError')
    await expect(observeSiteDiagnosticOperation(() => Promise.reject(abort), failed)).rejects.toBe(abort)
    target.dispatchEvent(new ErrorEvent('error', { error: abort })); rejection(target, Promise.resolve(), abort)
    let cancelled = false, reject!: (error: Error) => void
    const operation = observeSiteDiagnosticOperation(() => new Promise<never>((_, fail) => { reject = fail }), failed, () => !cancelled)
    const original = new Error('PRIVATE cancellation'), result = expect(operation).rejects.toBe(original)
    cancelled = true; reject(original); await result; rejection(target, operation, original)
    expect(receive).not.toHaveBeenCalled()
  })
  it('an old cleanup cannot stop a replacement subscription', () => {
    const old = subscribeSiteDiagnosticEvents(vi.fn()), current = subscribe()
    old(); emitSiteDiagnosticEvent(failed(), captureSiteDiagnosticContext())
    expect(current).toHaveBeenCalledWith(failed())
  })
})
