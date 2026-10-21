// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommunityContext, emptySession } from './context'
import { builtModules } from './build-follow-up'
import { INVITE_WAIT_SECONDS, PendingFollowsClaim } from './DownloadSignupInvite'
import { DownloadSignupCard, DownloadSignupInvite, moduleList } from './DownloadSignupInvite'
import { rememberPendingFollows, takePendingFollows } from './pending-follows'
import { useDownloadFollows } from './useDownloadFollows'
import type { Session } from './api'

const mocks = vi.hoisted(() => ({ post: vi.fn(), track: vi.fn() }))
vi.mock('./api', () => ({ api: vi.fn(), post: mocks.post }))
vi.mock('./usage', () => ({ trackUsage: mocks.track }))
const member: Session = { available: true, admin: false, user: { id: 'member', username: 'member', displayName: 'Member', verified: true } }
const unverified: Session = { available: true, admin: false, user: { id: 'new', username: 'new', displayName: 'New', verified: false } }
const build = { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapeecho']) }
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); localStorage.clear()
  mocks.post.mockResolvedValue({ enabled: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  window.history.replaceState(null, '', '/#octatrack/configuration')
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
const render = (session: Session, child: ReactNode) => act(() => root.render(createElement(CommunityContext.Provider, { value: { session, refresh: async () => {}, refreshDeveloper: async () => {}, developer: null, catalog: [] }, children: child })))

/** A build panel reduced to its download button and what follows it. */
function Panel() {
  const { followDownloads, followNotice, invite, closeInvite, closeCard } = useDownloadFollows()
  return createElement('div', null,
    createElement('button', { className: 'download', onClick: () => followDownloads(['miniverb', 'tapeecho'], build) }, 'Download'),
    followNotice && createElement('p', { className: 'notice' }, followNotice),
    invite?.stage === 'dialog' && createElement(DownloadSignupInvite, { modules: invite.modules, onClose: closeInvite }),
    invite?.stage === 'card' && createElement(DownloadSignupCard, { modules: invite.modules, onClose: closeCard }))
}
const download = () => act(() => container.querySelector<HTMLButtonElement>('.download')!.click())

it('invites a guest after the download, keeps it up for a few seconds and remembers what to follow', async () => {
  vi.useFakeTimers()
  await render(emptySession, createElement(Panel))
  await download()
  const dialog = container.querySelector('dialog')!
  expect(dialog.open).toBe(true)
  expect(container.querySelector('.signup-invite-card')).toBeNull()
  expect(mocks.post).not.toHaveBeenCalled()
  expect(mocks.track).toHaveBeenCalledWith('download_signup_prompt_shown')
  for (const perk of ['Update emails', 'Report bugs', 'Request modules', 'Join the forum', 'Rate & like']) expect(dialog.textContent).toContain(perk)
  expect([...dialog.querySelectorAll('.signup-invite-modules li')].map(item => item.textContent)).toEqual(build.modules.map(module => module.name))
  const signup = dialog.querySelector<HTMLAnchorElement>('a[href^="#account/register"]')!
  expect(signup.getAttribute('href')).toBe('#account/register?next=octatrack%2Fconfiguration')
  const later = dialog.querySelector<HTMLButtonElement>('.signup-invite-later')!
  expect(later.disabled).toBe(true)
  expect(later.textContent).toBe(`Not now (${INVITE_WAIT_SECONDS}s)`)
  // Escape does nothing while the wait runs.
  await act(() => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })) })
  expect(container.querySelector('dialog')).not.toBeNull()
  for (let second = 0; second < INVITE_WAIT_SECONDS; second++) await act(() => vi.advanceTimersByTime(1000))
  expect(later.disabled).toBe(false)
  await act(() => later.click())
  expect(container.querySelector('dialog')).toBeNull()
  // A smaller card naming the modules follows, and a second download does not reopen the dialog.
  expect(container.querySelector('.signup-invite-card h3')?.textContent).toBe('Get fixes for ' + build.modules.map(module => module.name).join(' and '))
  await download()
  expect(container.querySelector('dialog')).toBeNull()
  // Closing the card keeps it closed for the visit.
  await act(() => container.querySelector<HTMLButtonElement>('.signup-invite-card-close')!.click())
  expect(container.querySelector('.signup-invite-card')).toBeNull()
  await download()
  expect(container.querySelector('.signup-invite-card, dialog')).toBeNull()
  expect(takePendingFollows()?.ids).toEqual(['miniverb', 'tapeecho'])
})

it('counts Create account presses', async () => {
  await render(emptySession, createElement(Panel))
  await download()
  const signup = container.querySelector<HTMLAnchorElement>('dialog a[href^="#account/register"]')!
  signup.addEventListener('click', event => event.preventDefault())
  await act(() => signup.click())
  expect(mocks.track).toHaveBeenCalledWith('download_signup_clicked')
  expect(container.querySelector('dialog')).toBeNull()
})

it('follows a verified member’s download at once, without the invitation', async () => {
  await render(member, createElement(Panel))
  await download()
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('.signup-invite-card')).toBeNull()
  expect(mocks.post.mock.calls).toEqual([['/modules/miniverb/download', {}], ['/modules/tapeecho/download', {}]])
})

it('asks a member without a verified email to verify, and keeps the download for later', async () => {
  await render(unverified, createElement(Panel))
  await download()
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('.notice')?.textContent).toContain('Verify your email')
  expect(mocks.post).not.toHaveBeenCalled()
  expect(takePendingFollows()?.ids).toEqual(['miniverb', 'tapeecho'])
})

it('follows the remembered download once the new account is verified, then forgets it', async () => {
  rememberPendingFollows(['miniverb', 'tapeecho'], build)
  await render(unverified, createElement(PendingFollowsClaim))
  expect(mocks.post).not.toHaveBeenCalled()
  await render(member, createElement(PendingFollowsClaim))
  await act(async () => {})
  expect(mocks.post.mock.calls).toEqual([['/modules/miniverb/download', {}], ['/modules/tapeecho/download', {}]])
  expect(mocks.track).toHaveBeenCalledWith('download_follows_claimed')
  expect(container.textContent).toContain('You’re following updates for the 2 modules you downloaded')
  expect(takePendingFollows()).toBeNull()
})

it('drops a remembered download after thirty days', () => {
  rememberPendingFollows(['miniverb'], undefined, Date.now() - 31 * 24 * 60 * 60 * 1000)
  expect(takePendingFollows()).toBeNull()
})

it('names up to three modules in the card and counts the rest', () => {
  const named = (...names: string[]) => names.map(name => ({ id: name, name, version: '1' }))
  expect(moduleList(named('A'))).toBe('A')
  expect(moduleList(named('A', 'B', 'C'))).toBe('A, B and C')
  expect(moduleList(named('A', 'B', 'C', 'D', 'E'))).toBe('A, B and 3 more')
  expect(moduleList([])).toBe('your modules')
})
