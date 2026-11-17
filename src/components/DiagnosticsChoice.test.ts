// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsGuideStep, DiagnosticsInvitation, DiagnosticsInvitationGate } from './DiagnosticsInvitation'
import type { LinkDiagnostic, LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { offerDiagnostics, REASK_PAUSE_DAYS, resetReask } from '../community/diagnostics-reask'
const mocked = vi.hoisted(() => ({
  state: { accountId: 'member' as string | null, available: true, enabled: false, ready: true, busy: false, error: '', notice: '', hasChoice: false, saved: false, lastSent: null },
  listeners: new Set<() => void>(), share: vi.fn(), count: vi.fn(), privacy: false,
}))
vi.mock('../community/octatrack-diagnostics', () => ({
  diagnosticPreference: () => mocked.state,
  subscribeDiagnosticPreference: (listener: () => void) => { mocked.listeners.add(listener); return () => { mocked.listeners.delete(listener) } },
  changeDiagnosticSharing: mocked.share,
}))
vi.mock('../community/usage', () => ({ browserRequestsPrivacy: () => mocked.privacy, countDiagnosticsInvitation: mocked.count }))
let root: Root, container: HTMLDivElement
let linkState: LinkState
const linkListeners = new Set<() => void>(), diagnosticListeners = new Set<(event: LinkDiagnostic) => void>()
const identity = { canSubmit: true, base: 'a'.repeat(64), model: 'OCTATRACK 1.40C' }
const link = {
  getState: () => linkState, start: () => () => {},
  subscribe: (listener: () => void) => { linkListeners.add(listener); return () => { linkListeners.delete(listener) } },
  subscribeDiagnostics: (listener: (event: LinkDiagnostic) => void) => { diagnosticListeners.add(listener); return () => { diagnosticListeners.delete(listener) } },
} as unknown as OctatrackLink
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const setPreference = async (value: Partial<typeof mocked.state>) => { await act(async () => { mocked.state = { ...mocked.state, ...value }; mocked.listeners.forEach(listener => listener()); await flush() }) }
const setLink = async (state: LinkState) => { await act(async () => { linkState = state; linkListeners.forEach(listener => listener()); await flush() }) }
const emit = async (event: LinkDiagnostic) => { await act(async () => { diagnosticListeners.forEach(listener => listener(event)); await flush() }) }
const syncFailed = (error: LinkDiagnostic['error'] = 'device'): LinkDiagnostic => ({ event: 'sync_failed', phase: 'sending', error })
function button(text: string) { const result = [...container.querySelectorAll('button')].find(item => item.textContent === text); if (!result) throw new Error('missing button ' + text); return result }
const dialog = () => container.querySelector('dialog[open]')
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mocked.privacy = false
  mocked.state = { accountId: 'member', available: true, enabled: false, ready: true, busy: false, error: '', notice: '', hasChoice: false, saved: false, lastSent: null }
  mocked.share.mockResolvedValue(true); localStorage.clear(); resetReask()
  linkState = { status: 'ready', identity }; linkListeners.clear(); diagnosticListeners.clear()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.querySelectorAll('dialog').forEach(item => item.remove()); vi.useRealTimers(); vi.unstubAllGlobals() })
async function render(element: ReturnType<typeof createElement>) { await act(async () => { root.render(element); await flush() }) }

describe('a free choice', () => {
  it('offers Not now beside Share diagnostics, the main button, with no beta condition', async () => {
    const onClose = vi.fn()
    await render(createElement(DiagnosticsInvitation, { onClose, placement: 'hub' }))
    expect(container.textContent).not.toMatch(/beta/i)
    expect(container.textContent).toContain('Builds and syncing work either way')
    expect(button('Share diagnostics').className).toBe('button button-primary'); expect(button('Not now').className).toBe('button button-quiet')
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    await act(async () => { button('Not now').click(); await flush() })
    expect(onClose).toHaveBeenCalledWith(false); expect(mocked.share).not.toHaveBeenCalled()
    expect(mocked.count.mock.calls).toEqual([['shown', 'hub'], ['not-now', 'hub']])
  })
  it('counts a share once and reports it to the caller; a preview counts nothing', async () => {
    const onClose = vi.fn()
    await render(createElement(DiagnosticsInvitation, { onClose, placement: 'settings' }))
    await act(async () => { button('Share diagnostics').click(); await flush() })
    expect(mocked.share).toHaveBeenCalledWith(true); expect(onClose).toHaveBeenCalledWith(true)
    expect(mocked.count.mock.calls).toEqual([['shown', 'settings'], ['shared', 'settings']])
    await act(async () => root.unmount()); root = createRoot(container); mocked.count.mockClear()
    await render(createElement(DiagnosticsInvitation, { onClose, placement: 'hub', preview: true }))
    await act(async () => { button('Not now').click(); await flush() })
    expect(mocked.count).not.toHaveBeenCalled()
  })
})

describe('the install guide’s diagnostics step', () => {
  it('offers Share and Not now to a member who doesn’t share, and Not now finishes the step', async () => {
    const onDone = vi.fn()
    await render(createElement(DiagnosticsGuideStep, { onDone }))
    expect(container.textContent).toContain('Help make this work on every Octatrack'); expect(container.textContent).toContain('What gets shared')
    expect(container.textContent).toContain('under Diagnostics in Your Octatrack')
    expect(container.querySelector('dialog')).toBeNull() // a part of the guide, not a dialog over it
    await act(async () => { button('Not now').click(); await flush() })
    expect(onDone).toHaveBeenCalledWith(false); expect(mocked.share).not.toHaveBeenCalled()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Nothing is shared')
    expect(mocked.count.mock.calls).toEqual([['shown', 'guide'], ['not-now', 'guide']])
  })
  it('turns sharing on with Share diagnostics and finishes the step', async () => {
    const onDone = vi.fn()
    await render(createElement(DiagnosticsGuideStep, { onDone }))
    await act(async () => { button('Share diagnostics').click(); await flush() })
    await setPreference({ enabled: true, hasChoice: true })
    expect(onDone).toHaveBeenCalledWith(true)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Thanks. Diagnostics sharing is on.')
    expect(mocked.count.mock.calls).toEqual([['shown', 'guide'], ['shared', 'guide']])
  })
  it('stays on the step when the choice wasn’t saved', async () => {
    const onDone = vi.fn(); mocked.share.mockResolvedValueOnce(false)
    await render(createElement(DiagnosticsGuideStep, { onDone }))
    await act(async () => { button('Share diagnostics').click(); await flush() })
    expect(onDone).not.toHaveBeenCalled(); expect(button('Not now')).toBeTruthy()
  })
  it('is the answer to the first-connection invitation too: it doesn’t follow the guide, on this visit or the next', async () => {
    await render(createElement(DiagnosticsGuideStep, {}))
    await act(async () => { button('Not now').click(); await flush() })
    await act(async () => root.unmount()); root = createRoot(container)
    await render(createElement(DiagnosticsInvitationGate, { memberId: 'member', link, eligible: true }))
    expect(dialog()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container); resetReask() // the next visit
    await render(createElement(DiagnosticsInvitationGate, { memberId: 'member', link, eligible: true }))
    expect(dialog()).toBeNull()
    expect(mocked.count.mock.calls).toEqual([['shown', 'guide'], ['not-now', 'guide']])
  })
  it('without an answer in the guide, the first-connection invitation still comes once', async () => {
    await render(createElement(DiagnosticsInvitationGate, { memberId: 'member', link, eligible: true }))
    expect(dialog()?.textContent).toContain('Help us find bugs')
    await act(async () => { button('Not now').click(); await flush() })
    await act(async () => root.unmount()); root = createRoot(container); resetReask()
    await render(createElement(DiagnosticsInvitationGate, { memberId: 'member', link, eligible: true }))
    expect(dialog()).toBeNull()
  })
  it('renders nothing for a member who already shares, and where sharing isn’t possible', async () => {
    for (const state of [{ enabled: true, hasChoice: true }, { accountId: null }, { ready: true, available: false }]) {
      mocked.state = { ...mocked.state, enabled: false, accountId: 'member', available: true, ...state }
      await render(createElement(DiagnosticsGuideStep, {}))
      expect(container.innerHTML, JSON.stringify(state)).toBe('')
    }
    mocked.state = { ...mocked.state, enabled: false, accountId: 'member', available: true }; mocked.privacy = true
    await render(createElement(DiagnosticsGuideStep, {}))
    expect(container.innerHTML).toBe('')
    expect(mocked.count).not.toHaveBeenCalled()
  })
})

describe('asking once more after a failure', () => {
  const gate = (props: Partial<Parameters<typeof DiagnosticsInvitationGate>[0]> = {}) => createElement(DiagnosticsInvitationGate, { memberId: 'member', link, eligible: true, ...props })
  beforeEach(() => { localStorage.setItem('modwerk.diagnostics.invitation:2026-11-11.1:member', 'dismissed') }) // past the first-connection invitation
  it('waits for the running sync to end, then asks in context once', async () => {
    await render(gate())
    await setLink({ status: 'sending', identity })
    await emit(syncFailed())
    expect(dialog()).toBeNull()
    await setLink({ status: 'ready', identity })
    expect(dialog()?.textContent).toContain('This sync failed. Sharing diagnostics would let us see why.')
    expect(mocked.count).toHaveBeenCalledWith('shown', 'after-failure')
  })
  it('a Not now pauses the question for this member for 30 days, in this browser', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    await render(gate())
    await emit(syncFailed())
    await act(async () => { button('Not now').click(); await flush() })
    expect(dialog()).toBeNull(); expect(mocked.count).toHaveBeenCalledWith('not-now', 'after-failure')
    expect(localStorage.getItem('modwerk.diagnostics.reask:member')).toBe('2026-11-11T12:00:00.000Z')
    await emit(syncFailed()); expect(dialog()).toBeNull()
    resetReask() // the next visit
    vi.setSystemTime(new Date(Date.parse('2026-11-11T12:00:00Z') + (REASK_PAUSE_DAYS - 1) * 86400000))
    await emit(syncFailed()); expect(dialog()).toBeNull()
    resetReask(); vi.setSystemTime(new Date(Date.parse('2026-11-11T12:00:00Z') + REASK_PAUSE_DAYS * 86400000))
    await emit(syncFailed()); expect(dialog()).not.toBeNull()
  })
  it('asks once per failure, and not for a sync the member cancelled', async () => {
    await render(gate())
    await emit(syncFailed('cancelled')); expect(dialog()).toBeNull()
    await emit({ event: 'selftest', phase: 'testing', active: 'b'.repeat(64), reading: { state: 3 } as LinkDiagnostic['reading'] })
    expect(dialog()?.textContent).toContain('The self-test failed.')
    await act(async () => { button('Share diagnostics').click(); await flush() })
    expect(dialog()).toBeNull(); expect(mocked.count).toHaveBeenCalledWith('shared', 'after-failure')
    await setPreference({ enabled: true, hasChoice: true })
    await emit(syncFailed()); expect(dialog()).toBeNull()
    expect(offerDiagnostics('selftest-failed', 'selftest:' + 'b'.repeat(64))).toBe(false)
  })
  it('asks when the unit started its previous base, once for that base', async () => {
    await render(gate())
    await setLink({ status: 'ready', identity, slots: { fellBack: true } as LinkState['slots'] })
    expect(dialog()?.textContent).toContain('started its previous base')
    expect(offerDiagnostics('recovery', 'recovery:' + identity.base)).toBe(false)
  })
  it('never asks while another dialog is open, outside the workspace, under privacy, after turning sharing off or after a Not now on this page', async () => {
    const other = document.createElement('dialog'); other.setAttribute('open', ''); document.body.append(other)
    await render(gate())
    await emit(syncFailed()); expect(dialog()).toBeNull()
    await act(async () => { other.removeAttribute('open'); await flush() })
    expect(dialog()).not.toBeNull()
    other.remove(); await act(async () => root.unmount()); root = createRoot(container); resetReask()
    await render(gate({ eligible: false })); await emit(syncFailed()); expect(dialog()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container); resetReask()
    await setPreference({ hasChoice: true, saved: true }) // turned off under the current text
    await render(gate()); await emit(syncFailed()); expect(dialog()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container); resetReask(); await setPreference({ hasChoice: false, saved: false })
    mocked.privacy = true; await render(gate()); await emit(syncFailed()); expect(dialog()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container); resetReask(); mocked.privacy = false
    await render(createElement(DiagnosticsGuideStep, {}))
    await act(async () => { button('Not now').click(); await flush() })
    await render(gate()); await emit(syncFailed()); expect(dialog()).toBeNull()
  })
  it('drops a question that waited too long', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    await render(gate({ blocked: true }))
    await emit(syncFailed()); expect(dialog()).toBeNull()
    vi.setSystemTime(new Date('2026-11-11T12:11:00Z'))
    await render(gate({ blocked: false }))
    expect(dialog()).toBeNull()
  })
})
