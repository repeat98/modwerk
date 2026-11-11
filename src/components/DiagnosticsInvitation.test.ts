// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsInvitation, DiagnosticsInvitationGate } from './DiagnosticsInvitation'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
const mocked = vi.hoisted(() => ({
  state: { accountId: 'member' as string | null, available: true, enabled: false, ready: true, busy: false, error: '', notice: '', hasChoice: false, saved: false, lastSent: null },
  listeners: new Set<() => void>(), share: vi.fn(), privacy: false,
}))
vi.mock('../community/octatrack-diagnostics', () => ({
  diagnosticPreference: () => mocked.state,
  subscribeDiagnosticPreference: (listener: () => void) => { mocked.listeners.add(listener); return () => { mocked.listeners.delete(listener) } },
  changeDiagnosticSharing: mocked.share,
}))
vi.mock('../community/usage', () => ({ browserRequestsPrivacy: () => mocked.privacy, countDiagnosticsInvitation: vi.fn() }))
import { resetReask } from '../community/diagnostics-reask'
let root: Root, container: HTMLDivElement, previous: HTMLButtonElement
let linkState: LinkState
const linkListeners = new Set<() => void>()
const identity = { canSubmit: true, base: 'a'.repeat(64), model: 'OCTATRACK MKII' }
const link = { getState: () => linkState, subscribeDiagnostics: () => () => {}, subscribe: (listener: () => void) => { linkListeners.add(listener); return () => { linkListeners.delete(listener) } }, start: () => () => {} } as unknown as OctatrackLink
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mocked.privacy = false
  linkState = { status: 'ready', identity }; linkListeners.clear()
  mocked.state = { accountId: 'member', available: true, enabled: false, ready: true, busy: false, error: '', notice: '', hasChoice: false, saved: false, lastSent: null }
  mocked.share.mockResolvedValue(true); localStorage.clear(); resetReask()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  previous = document.createElement('button'); document.body.append(previous); previous.focus()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); previous.remove(); document.querySelectorAll('dialog').forEach(dialog => dialog.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function render(props: Omit<Parameters<typeof DiagnosticsInvitationGate>[0], 'link'> & { link?: OctatrackLink | null }) { await act(async () => { root.render(createElement(DiagnosticsInvitationGate, { link, ...props })); await flush() }) }
async function connect(state: LinkState) { await act(async () => { linkState = state; linkListeners.forEach(listener => listener()); await flush() }) }
function button(text: string) { const result = [...container.querySelectorAll('button')].find(item => item.textContent === text); if (!result) throw new Error('missing button'); return result }

describe('diagnostics invitation without collection side effects', () => {
  it('makes preview Share and dismissal local, with no consent write or dismissal saved to a real account', async () => {
    await render({ memberId: 'member', eligible: true, preview: true, link: null })
    expect(container.textContent).toContain('Preview · no data is shared')
    await act(async () => { button('Share diagnostics').click(); await flush() })
    expect(mocked.share).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0)
    expect(container.querySelector('dialog')).toBeNull()
  })
  it('does not invite from opening the workspace or a failed/unsupported connection, then invites after verified USB readiness', async () => {
    await render({ memberId: 'member', eligible: true, link: null })
    expect(container.querySelector('dialog')).toBeNull()
    linkState = { status: 'idle' }
    await render({ memberId: 'member', eligible: true })
    for (const state of [{ status: 'connecting' }, { status: 'busy' }, { status: 'stock' }, { status: 'ready', identity: { ...identity, canSubmit: false } }, { status: 'testing', identity }] satisfies LinkState[]) {
      await connect(state)
      expect(container.querySelector('dialog')).toBeNull()
    }
    await connect({ status: 'ready', identity })
    expect(container.querySelector('dialog[open]')).not.toBeNull()
    expect(mocked.share).not.toHaveBeenCalled()
  })
  it('remembers the successful connection while installation finishes and does not repeat after dismissal on reconnect', async () => {
    linkState = { status: 'idle' }
    await render({ memberId: 'member', eligible: true, blocked: true })
    await connect({ status: 'ready', identity })
    expect(container.querySelector('dialog')).toBeNull()
    await connect({ status: 'idle' })
    await render({ memberId: 'member', eligible: true })
    expect(container.querySelector('dialog[open]')).not.toBeNull()
    await act(async () => { button('Not now').click(); await flush() })
    await connect({ status: 'ready', identity })
    expect(container.querySelector('dialog')).toBeNull()
    expect(mocked.share).not.toHaveBeenCalled()
  })
  it('does not reuse another member’s first connection or reopen a saved consent choice', async () => {
    await render({ memberId: 'member', eligible: true })
    await act(async () => { button('Not now').click(); await flush() })
    await connect({ status: 'idle' })
    mocked.state = { ...mocked.state, accountId: 'other' }
    await render({ memberId: 'other', eligible: true })
    expect(container.querySelector('dialog')).toBeNull()
    mocked.state = { ...mocked.state, hasChoice: true }
    await connect({ status: 'ready', identity })
    expect(container.querySelector('dialog')).toBeNull()
    expect(mocked.share).not.toHaveBeenCalled()
  })
  it('does not invite outside a firmware workspace, for a different account or under browser privacy', async () => {
    await render({ memberId: 'member', eligible: false }); expect(container.querySelector('dialog')).toBeNull()
    await render({ memberId: 'other', eligible: true }); expect(container.querySelector('dialog')).toBeNull()
    mocked.privacy = true; await render({ memberId: 'member', eligible: true }); expect(container.querySelector('dialog')).toBeNull()
    expect(mocked.share).not.toHaveBeenCalled()
  })
  it('waits for a pre-existing modal and focuses the invitation heading after that modal closes', async () => {
    const existing = document.createElement('dialog'); existing.setAttribute('open', ''); document.body.append(existing)
    await render({ memberId: 'member', eligible: true }); expect(container.querySelector('dialog')).toBeNull()
    await act(async () => { existing.removeAttribute('open'); await flush() })
    expect(container.querySelector('dialog[open]')).not.toBeNull()
    expect(document.activeElement).toBe(container.querySelector('h2'))
    expect(mocked.share).not.toHaveBeenCalled()
  })
  it('Escape dismisses without opting in and remembers only this version and member', async () => {
    await render({ memberId: 'member', eligible: true })
    await act(async () => { container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); await flush() })
    expect(mocked.share).not.toHaveBeenCalled(); expect(container.querySelector('dialog')).toBeNull()
    expect(localStorage.length).toBe(1); expect(localStorage.key(0)).toContain(':member')
    await act(async () => { root.unmount() }); root = createRoot(container)
    await render({ memberId: 'member', eligible: true }); expect(container.querySelector('dialog')).toBeNull()
    mocked.state = { ...mocked.state, accountId: 'other' }
    await render({ memberId: 'other', eligible: true }); expect(container.querySelector('dialog[open]')).not.toBeNull()
  })
  it('does not close a replacement account modal when an old Share operation finishes after unmount', async () => {
    const onClose = vi.fn(); let finish!: (value: boolean) => void
    mocked.share.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await act(async () => { root.render(createElement(DiagnosticsInvitation, { onClose })); await flush() })
    await act(async () => { button('Share diagnostics').click(); await flush() })
    await act(async () => root.unmount()); root = createRoot(container)
    mocked.state = { ...mocked.state, accountId: 'other' }
    await render({ memberId: 'other', eligible: true })
    await act(async () => { finish(true); await flush() })
    expect(onClose).not.toHaveBeenCalled(); expect(container.querySelector('dialog[open]')).not.toBeNull()
  })
  it('keeps a refused choice open and shows the store error without treating dismissal as consent', async () => {
    mocked.share.mockResolvedValueOnce(false)
    await render({ memberId: 'member', eligible: true })
    await act(async () => { button('Share diagnostics').click(); await flush(); mocked.state = { ...mocked.state, error: 'Choice was not saved.' }; mocked.listeners.forEach(listener => listener()) })
    expect(container.querySelector('dialog[open]')).not.toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Choice was not saved.')
    await act(async () => button('Not now').click())
    expect(mocked.share).toHaveBeenCalledTimes(1); expect(mocked.share).toHaveBeenCalledWith(true)
  })
})
