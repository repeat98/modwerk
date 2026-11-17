// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RemoteSessionBanner, RemoteSessionConsent } from './RemoteSession'
import { MemberRelay, pickUnit } from '../community/remote-session'
import { fakeUnit } from '../dev/octatrack-link-fake'
import { REMOTE_SESSION_CONSENT_VERSION, type RemoteSessionView } from '../community/remote-session-contract'

const calls = vi.hoisted(() => [] as { path: string; body: unknown }[])
vi.mock('../community/api', () => ({
  api: vi.fn(async () => ({})),
  post: vi.fn(async (path: string, body: unknown) => { calls.push({ path, body }); return path.endsWith('/accept') ? { session: {}, ticket: 'f'.repeat(64) } : { ok: true } }),
}))
let root: Root, container: HTMLDivElement
const session: RemoteSessionView = { id: '0f0e0d0c-0b0a-4908-8706-050403020100', status: 'pending', scope: 'read', requester: 'repeat98', reason: 'Your unit froze after a sync; I want to read its log.', minutes: 20,
  createdAt: '2026-10-20T12:00:00.000Z', expiresAt: '2026-10-20T12:10:00.000Z', answeredAt: null, endsAt: null, endedAt: null, endedBy: null }
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('WebSocket', class { addEventListener() {} send() {} close() {} })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const click = (element: Element) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(text))!

it('says who asks, why, for how long and that nothing can be changed, before any USB access', async () => {
  const unit = fakeUnit(), onStarted = vi.fn()
  const usb = { ...unit.usb, requestDevice: vi.fn(unit.usb.requestDevice) }
  await act(async () => root.render(createElement(RemoteSessionConsent, { session, version: REMOTE_SESSION_CONSENT_VERSION, onStarted, onAnswered: vi.fn(), onLater: vi.fn(), usb })))
  const text = container.querySelector('dialog[open]')!.textContent!
  expect(text).toContain('repeat98 asks to read your Octatrack')
  expect(text).toContain(session.reason)
  expect(text).toContain('20 minutes')
  expect(text).toContain('Nothing on your Octatrack can be changed')
  expect(text).toContain('Anthropic’s Claude')
  expect(usb.requestDevice).not.toHaveBeenCalled()
  expect(calls).toEqual([])
  await click(button('Accept'))
  await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
  expect(calls).toEqual([{ path: `/remote-sessions/${session.id}/accept`, body: { version: REMOTE_SESSION_CONSENT_VERSION } }])
  ;(onStarted.mock.calls[0][0] as MemberRelay).stop()
})
it('picks the Octatrack, not another Elektron device this site may open, and lists only Octatracks in the picker', async () => {
  const [base] = await fakeUnit('base').usb.getDevices(), [stock] = await fakeUnit('stock').usb.getDevices()
  const digitakt = { ...stock, productId: 0x7f, productName: 'Digitakt' } // a pretend other Elektron device on the original OS
  const usb = (devices: typeof base[]) => ({ async getDevices() { return devices }, addEventListener() {}, removeEventListener() {}, requestDevice: vi.fn(async () => base) })
  expect(await pickUnit(usb([digitakt, base]))).toBe(base)
  expect(await pickUnit(usb([digitakt, stock, base]))).toBe(base)
  expect(await pickUnit(usb([digitakt, stock]))).toBe(stock)
  const none = usb([digitakt])
  expect(await pickUnit(none)).toBe(base)
  expect(none.requestDevice).toHaveBeenCalledWith({ filters: [{ vendorId: 0x1935, productId: 0x0002 }] })
})
it('declines without touching USB, and says when the browser has no WebUSB', async () => {
  const onAnswered = vi.fn()
  await act(async () => root.render(createElement(RemoteSessionConsent, { session, version: REMOTE_SESSION_CONSENT_VERSION, onStarted: vi.fn(), onAnswered, onLater: vi.fn(), usb: undefined })))
  expect(container.textContent).toContain('need Chrome or Edge')
  expect(button('Accept').disabled).toBe(true)
  await click(button('Decline'))
  expect(calls).toEqual([{ path: `/remote-sessions/${session.id}/decline`, body: {} }])
  expect(onAnswered).toHaveBeenCalled()
})
it('keeps the request open when Chrome can’t open the Octatrack', async () => {
  const unit = fakeUnit()
  unit.taken = true
  await act(async () => root.render(createElement(RemoteSessionConsent, { session, version: REMOTE_SESSION_CONSENT_VERSION, onStarted: vi.fn(), onAnswered: vi.fn(), onLater: vi.fn(), usb: { ...unit.usb } })))
  await click(button('Accept'))
  await vi.waitFor(() => expect(container.querySelector('[role=alert]')?.textContent).toContain('Chrome couldn’t open the Octatrack'))
  expect(calls).toEqual([])
})
it('shows the running session with its requests and an End button', async () => {
  const unit = fakeUnit(), [device] = await unit.usb.getDevices()
  const relay = new MemberRelay({ id: session.id, scope: 'read', device, vendorInterface: 5, ticket: async () => 'f'.repeat(64), open: () => ({ addEventListener() {}, send() {}, close() {} }) })
  await act(async () => root.render(createElement(RemoteSessionBanner, { relay, session: { ...session, status: 'active', endsAt: '2026-10-20T12:30:00.000Z' }, onClosed: vi.fn() })))
  expect(container.textContent).toContain('repeat98 can read your Octatrack')
  expect(container.textContent).toContain('Read-only; 0 requests so far')
  await click(button('Show requests'))
  expect(container.textContent).toContain('No requests yet.')
  await click(button('End'))
  expect(relay.getState().status).toBe('ended')
  expect(calls).toEqual([{ path: `/remote-sessions/${session.id}/end`, body: {} }])
  expect(container.textContent).toContain('Remote session ended. You ended it.')
})
