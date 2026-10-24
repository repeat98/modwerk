// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BetaJoinPrompt } from './BetaJoinPrompt'
import { CommunityContext, emptySession } from '../community/context'
import { BETA_RISKS_VERSION } from '../config/beta-invitation'
import type { Session } from '../community/api'

const mocks = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn(), refresh: vi.fn(async () => {}) }))
vi.mock('../community/api', () => ({ api: mocks.api, post: mocks.post }))
let root: Root, container: HTMLDivElement
const member: Session = { available: true, admin: false, user: { id: 'member', username: 'member', displayName: 'Member', verified: true } }
const answers = (places: number, status = 'pending') => mocks.api.mockImplementation(async (path: string) => path === '/auth/beta-join' ? { placesLeft: places } : { status })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear()
  Object.defineProperty(navigator, 'usb', { value: {}, configurable: true })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function render(session: Session = member) {
  await act(() => root.render(createElement(CommunityContext.Provider, { value: { session, refresh: mocks.refresh, refreshDeveloper: async () => {}, developer: null, catalog: [] } }, createElement(BetaJoinPrompt))))
  await act(() => vi.advanceTimersByTimeAsync(1600))
}
const button = (name: string) => [...container.querySelectorAll<HTMLElement>('button, a')].find(item => item.textContent === name)

it('stays away while the round is closed, and from a member whose invitation was already used', async () => {
  answers(0); await render()
  expect(container.querySelector('dialog')).toBeNull()
  answers(12, 'full'); await act(() => root.unmount()); root = createRoot(container); await render()
  expect(container.querySelector('dialog')).toBeNull()
  expect(mocks.api).toHaveBeenCalledWith('/auth/beta-invitations/public', expect.anything())
})

it('sends a visitor to sign in and back to the join page, and Not now lasts for this round', async () => {
  answers(12); await render({ ...emptySession, available: true, registrationAvailable: true })
  expect(container.textContent).toContain('12 of 50 places left')
  expect(button('Sign in')?.getAttribute('href')).toBe('#account/login?next=' + encodeURIComponent('beta/join/public'))
  expect(button('Create account')).toBeDefined()
  expect(button('Join the beta')).toBeUndefined()
  expect(mocks.api).not.toHaveBeenCalledWith('/auth/beta-invitations/public', expect.anything())
  await act(() => button('Not now')!.click())
  expect(container.querySelector('dialog')).toBeNull()
  await act(() => root.unmount()); root = createRoot(container); mocks.api.mockClear(); await render()
  expect(mocks.api).not.toHaveBeenCalled()
})

it('joins with the current risk acknowledgement only after the box is ticked, then refreshes the session', async () => {
  answers(3); mocks.post.mockResolvedValue({ status: 'active' }); await render()
  expect(container.textContent).toContain('Load modules over USB')
  expect(container.textContent).toContain('Turn on diagnostics')
  expect(button('Join the beta')?.hasAttribute('disabled')).toBe(true)
  await act(() => container.querySelector<HTMLInputElement>('.risk-accept input')!.click())
  await act(() => button('Join the beta')!.click())
  expect(mocks.post).toHaveBeenCalledWith('/auth/beta-invitations/public', { acceptRisks: true, risksVersion: BETA_RISKS_VERSION })
  expect(mocks.refresh).toHaveBeenCalled()
})

it('offers no way in from a browser without USB', async () => {
  Reflect.deleteProperty(navigator, 'usb')
  answers(3); await render()
  expect(container.textContent).toContain('Open Modwerk in Chrome or Edge on a computer to join')
  expect(button('Join the beta')).toBeUndefined()
  expect(button('Sign in')).toBeUndefined()
})
