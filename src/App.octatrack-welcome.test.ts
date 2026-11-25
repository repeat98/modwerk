// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CommunityContext } from './community/context'
import type { Session } from './community/api'
import { fakeUnit } from './dev/octatrack-link-fake'

// A production build with the Octatrack base path's switch flipped per test, on a computer.
const release = vi.hoisted(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) as unknown as MediaQueryList
  return { on: true }
})
vi.mock('./config/octatrack-base', () => ({ get OCTATRACK_BASE_RELEASED() { return release.on } }))
vi.mock('./engine/protocol', async original => ({ ...await original<typeof import('./engine/protocol')>(), USB_LINK: false }))

const member: Session = { available: true, admin: false, user: { id: 'plain', displayName: 'Plain', username: 'plain', verified: true, betaTester: false } }
const visitor: Session = { available: true, admin: false, user: null }
let root: Root, container: HTMLDivElement, neverHadBase = true
beforeEach(() => {
  // Advance other page prompts while USB and IndexedDB callbacks use real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  release.on = true; neverHadBase = true
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'usb', { value: fakeUnit('stock').usb, configurable: true })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('base-install-prompt') ? Response.json({ show: neverHadBase })
    : String(url).includes('/auth/beta-join') ? Response.json({ placesLeft: 0 }) : String(url).includes('/beta-invitations/public') ? Response.json({ status: 'pending' })
    : new Response('{}', { status: 404 })))
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
  vi.useRealTimers()
  delete (navigator as { usb?: unknown }).usb; sessionStorage.clear(); localStorage.clear()
})

async function open(hash: string, session = member) {
  window.location.hash = hash
  const value = { session, loading: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(App))))
  await act(() => vi.dynamicImportSettled())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
}
/** The next visit: the page loads again. */
async function reload(hash: string, session = member) { await act(async () => root.unmount()); root = createRoot(container); await open(hash, session) }
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const welcome = () => [...document.querySelectorAll<HTMLDialogElement>('dialog.base-install-dialog[open]')].find(dialog => dialog.querySelector('h2')?.textContent === 'Modules now load over USB, for everyone')
const guide = () => [...document.querySelectorAll<HTMLDialogElement>('dialog.base-install-dialog[open]')].find(dialog => /Modwerk base/i.test(dialog.querySelector('h2')?.textContent ?? ''))
const button = (dialog: HTMLElement, text: string) => [...dialog.querySelectorAll('button')].find(item => item.textContent === text)

describe('the Octatrack USB introduction', () => {
  it.each([['member', member], ['visitor', visitor]] as const)('keeps browsing quiet for a %s, including on a stock Octatrack', async (_label, session) => {
    for (const route of ['overview', 'digitakt', 'library', 'configuration', 'octatrack', 'octatrack/setup']) {
      await open(route, session)
      await wait(3000)
      expect(welcome()).toBeUndefined()
      expect(guide()).toBeUndefined()
    }
  }, 20000)
  it('opens the introduction for a first install and continues to the card download', async () => {
    await open('octatrack/setup')
    await vi.waitFor(() => expect(container.querySelector('.instrument-action')?.getAttribute('title')).toBe('Original OS detected. Install once from the card.'))
    await act(async () => container.querySelector<HTMLButtonElement>('.instrument-action')!.click())
    await vi.waitFor(() => expect(welcome()).toBeDefined())
    expect(welcome()!.textContent).toContain('Sync over USB or the card')
    await act(async () => button(welcome()!, 'Set up my Octatrack')!.click())
    await vi.waitFor(() => expect(guide()?.querySelector('#base-stage-title')?.textContent).toBe('Download the base'))
  }, 15000)
  it('lets a visitor read the instructions on demand in a browser without WebUSB', async () => {
    delete (navigator as { usb?: unknown }).usb
    await open('octatrack/setup', visitor)
    await act(async () => button(container, 'What’s new: modules over USB')!.click())
    await vi.waitFor(() => expect(welcome()).toBeDefined())
    expect(welcome()!.textContent).toContain('This browser can’t use USB')
    await act(async () => button(welcome()!, 'Later')!.click())
    await reload('octatrack/setup', visitor)
    await wait(3000)
    expect(welcome()).toBeUndefined()
    expect(guide()).toBeUndefined()
  }, 15000)
})
