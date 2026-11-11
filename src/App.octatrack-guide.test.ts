// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CommunityContext } from './community/context'
import type { Session } from './community/api'
import { fakeUnit } from './dev/octatrack-link-fake'
import { waitForBaseInstall } from './config/octatrack-progress'
import { OCTATRACK_DIAGNOSTICS_VERSION } from './community/octatrack-diagnostics-contract'
import baseBinding from '../sdk/machines/octatrack/base-binding.json' with { type: 'json' }

// A production build with the Octatrack base path released, for a member who is not a beta tester, on a computer whose
// browser has WebUSB and an Octatrack on the original OS plugged in.
const release = vi.hoisted(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) as unknown as MediaQueryList
  return { on: true }
})
vi.mock('./config/octatrack-base', () => ({ get OCTATRACK_BASE_RELEASED() { return release.on } }))
vi.mock('./engine/protocol', async original => ({ ...await original<typeof import('./engine/protocol')>(), USB_LINK: false }))

const member: Session = { available: true, admin: false, user: { id: 'plain', displayName: 'Plain', username: 'plain', verified: true, betaTester: false } }
const visitor: Session = { available: true, admin: false, user: null }
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'usb', { value: fakeUnit('stock').usb, configurable: true })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('base-install-prompt') ? Response.json({ show: true }) : new Response('{}', { status: 404 })))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  for (const name of ['scrollTo', 'scrollIntoView']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  delete (navigator as { usb?: unknown }).usb; sessionStorage.clear(); localStorage.clear()
})

async function open(hash: string, session = member) {
  window.location.hash = hash
  const value = { session, loading: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(App))))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
}
const guide = () => document.querySelector<HTMLDialogElement>('dialog.base-install-dialog[open]')
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })

describe('the Octatrack base path for a member who is not a beta tester', () => {
  it('walks them through the base install from Your Octatrack, not from other pages', async () => {
    await open('library')
    // The unit was read (the sidebar offers the install), and the guide still waits for Your Octatrack.
    await vi.waitFor(() => expect(container.querySelector('.instrument-action')?.getAttribute('title')).toBe('Original OS detected. Install once from the card.'), { timeout: 3000 })
    await wait(2500)
    expect(guide()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container)
    await open('octatrack')
    await vi.waitFor(() => expect(guide()).not.toBeNull(), { timeout: 5000 })
    expect(guide()!.querySelector('h2')?.textContent).toBe('Install the Modwerk base')
    expect(guide()!.textContent).not.toMatch(/beta/i)
    expect(guide()!.textContent).toContain('goes through the card')
    // Each run of the guide is counted without any identifier: here, that it opened.
    const counts = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/usage/count')).map(([, options]) => JSON.parse(String(options?.body)))
    expect(counts).toContainEqual({ event: 'base_guide_opened' })
  }, 15000)
  it('shows Your Octatrack and its Setup without beta framing, with the card build as a labelled, folded fallback', async () => {
    await open('octatrack/setup')
    await vi.waitFor(() => expect(document.title).toContain('Your Octatrack'))
    expect(container.querySelector('h1')?.textContent).toBe('Your Octatrack')
    expect(container.querySelector('.page-heading .module-beta-badge')).toBeNull()
    expect(container.querySelector('.brand-beta-badge')).toBeNull()
    const card = container.querySelector<HTMLDetailsElement>('details.card-install')!
    expect(card.querySelector('summary')?.textContent).toBe('Card firmware without the base Fallback')
    expect(card.open).toBe(false) // this browser can use USB
    expect(card.textContent).toContain('For browsers without USB (Firefox, Safari, iPad and phones) and for modules that have no USB version yet (')
    expect(container.textContent).not.toContain('#beta-testers')
  })
  it('ends a first install with the diagnostics question for a member who doesn’t share, and keeps the answer in view', async () => {
    const unit = fakeUnit('stock')
    Object.defineProperty(navigator, 'usb', { value: unit.usb, configurable: true })
    let sharing = false
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request, options?: RequestInit) => {
      if (String(url).includes('base-install-prompt')) return Response.json({ show: true })
      if (!String(url).includes('/octatrack/diagnostics/consent')) return new Response('{}', { status: 404 })
      if (options?.method === 'PUT') sharing = JSON.parse(String(options.body)).enabled
      return Response.json({ accountId: 'plain', enabled: sharing, version: OCTATRACK_DIAGNOSTICS_VERSION, changedAt: sharing ? new Date().toISOString() : null, expiresAt: sharing ? new Date(Date.now() + 86400000).toISOString() : null })
    })
    waitForBaseInstall('ab'.repeat(32), baseBinding.identity) // the base was downloaded and installed from the card
    await open('octatrack')
    await vi.waitFor(() => expect(guide()?.textContent).toContain('Waiting for your Octatrack'), { timeout: 5000 })
    unit.base = baseBinding.identity; unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(guide()?.textContent).toContain('Share diagnostics?'), { timeout: 5000 })
    expect(guide()!.querySelector('h2')?.textContent).toBe('The Modwerk base is installed')
    const share = [...guide()!.querySelectorAll('button')].find(button => button.textContent === 'Share diagnostics')!
    await vi.waitFor(() => expect(share.disabled).toBe(false))
    await act(async () => { share.click() })
    // Sharing is on now; the guide keeps its last view with the answer and Continue.
    await vi.waitFor(() => expect(guide()?.textContent).toContain('Thanks. Diagnostics sharing is on.'))
    expect(guide()!.querySelector('h2')?.textContent).toBe('The Modwerk base is installed')
    expect([...guide()!.querySelectorAll('button')].some(button => button.textContent === 'Continue')).toBe(true)
    expect(document.querySelector('dialog.diagnostics-invitation')).toBeNull()
  }, 15000)
  it('leads a signed-out visitor on Your Octatrack to sign in', async () => {
    await open('octatrack', visitor)
    await vi.waitFor(() => expect(container.querySelector('.hub-account-note')).not.toBeNull())
    expect(container.querySelector('.hub-account-note a')?.getAttribute('href')).toBe('#account/login?next=octatrack')
  })
})
