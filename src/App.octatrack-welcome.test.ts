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
let root: Root, container: HTMLDivElement, neverHadBase = true, placesLeft = 0
beforeEach(() => {
  release.on = true; neverHadBase = true; placesLeft = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'usb', { value: fakeUnit('stock').usb, configurable: true })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('base-install-prompt') ? Response.json({ show: neverHadBase })
    : String(url).includes('/auth/beta-join') ? Response.json({ placesLeft }) : String(url).includes('/beta-invitations/public') ? Response.json({ status: 'pending' })
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
  delete (navigator as { usb?: unknown }).usb; sessionStorage.clear(); localStorage.clear()
})

async function open(hash: string, session = member) {
  window.location.hash = hash
  const value = { session, loading: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(App))))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
}
/** The next visit: the page loads again. */
async function reload(hash: string, session = member) { await act(async () => root.unmount()); root = createRoot(container); await open(hash, session) }
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
const welcome = () => [...document.querySelectorAll<HTMLDialogElement>('dialog.base-install-dialog[open]')].find(dialog => dialog.querySelector('h2')?.textContent === 'Modules now load over USB, for everyone')
const guide = () => [...document.querySelectorAll<HTMLDialogElement>('dialog.base-install-dialog[open]')].find(dialog => dialog !== welcome())
const button = (dialog: HTMLElement, text: string) => [...dialog.querySelectorAll('button')].find(item => item.textContent === text)

describe('the welcome to modules over USB', () => {
  it('greets a member who never had the base once, and Later keeps it away, on this visit and the next', async () => {
    await open('library')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    expect(welcome()!.textContent).toContain('Install the base once')
    expect(welcome()!.textContent).toContain('The first install goes through the card: the original OS has no USB link for Modwerk.')
    expect(welcome()!.textContent).toContain('Later base updates go over USB.')
    expect(welcome()!.textContent).not.toMatch(/beta/i)
    expect(button(welcome()!, 'Build card firmware instead')).toBeDefined()
    await act(async () => button(welcome()!, 'Later')!.click())
    expect(welcome()).toBeUndefined()
    await wait(2000)
    expect(document.querySelector('dialog[open]')).toBeNull()
    await reload('library'); await wait(2000)
    expect(welcome()).toBeUndefined()
  }, 15000)
  it('greets a visitor whose browser never read a base, once', async () => {
    Object.defineProperty(navigator, 'usb', { value: fakeUnit('none').usb, configurable: true })
    await open('library', visitor)
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    await act(async () => button(welcome()!, 'Later')!.click())
    await reload('library', visitor); await wait(2000)
    expect(welcome()).toBeUndefined()
  }, 15000)
  it('is not there while the switch is off', async () => {
    release.on = false
    await open('library'); await wait(2000)
    expect(welcome()).toBeUndefined()
  })
  it('never greets someone whose unit or account has the base', async () => {
    Object.defineProperty(navigator, 'usb', { value: fakeUnit('base').usb, configurable: true })
    await open('library'); await wait(2000)
    expect(welcome()).toBeUndefined()
    Object.defineProperty(navigator, 'usb', { value: fakeUnit('none').usb, configurable: true })
    neverHadBase = false
    await reload('library'); await wait(2000)
    expect(welcome()).toBeUndefined()
  }, 15000)
  it('“Set up my Octatrack” lands on Your Octatrack with the install guide open at its first step', async () => {
    await open('library')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    await act(async () => button(welcome()!, 'Set up my Octatrack')!.click())
    expect(window.location.hash).toBe('#octatrack')
    await vi.waitFor(() => expect(guide()?.querySelector('#base-stage-title')?.textContent).toBe('Download the base'))
    expect(welcome()).toBeUndefined()
  }, 15000)
  it('stands in for every build and sync button once: they all lead to Your Octatrack, where it opens before the guide', async () => {
    await open('library'); await wait(100)
    // The library's own button (Your Octatrack), the sidebar and the phone dock all lead to #configuration.
    expect(container.querySelector<HTMLAnchorElement>('.discovery-actions a.button-primary')?.getAttribute('href')).toBe('#configuration')
    await reload('configuration')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    expect(guide()).toBeUndefined()
    await act(async () => button(welcome()!, 'Build card firmware instead')!.click())
    expect(window.location.hash).toBe('#octatrack/setup')
    await vi.waitFor(() => expect(container.querySelector<HTMLDetailsElement>('details.card-install')?.open).toBe(true))
    // Not again: the next visit to the same button gets the guide, as before the welcome.
    await reload('configuration')
    await vi.waitFor(() => expect(guide()).toBeDefined(), { timeout: 4000 })
    expect(welcome()).toBeUndefined()
  }, 20000)
  it('in a browser without WebUSB, says so and makes the card firmware the way', async () => {
    delete (navigator as { usb?: unknown }).usb
    await open('library')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    expect(welcome()!.textContent).toContain('This browser can’t use USB. Open Modwerk in Chrome or Edge on a computer')
    expect(button(welcome()!, 'Set up my Octatrack')).toBeUndefined()
    const card = button(welcome()!, 'Build card firmware')!
    expect(card.className).toContain('button-primary')
    await act(async () => card.click())
    expect(window.location.hash).toBe('#octatrack/setup')
  }, 15000)
  it('can be read again from Setup', async () => {
    await open('octatrack/setup')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    await act(async () => button(welcome()!, 'Later')!.click())
    const again = [...container.querySelectorAll('button')].find(item => item.textContent === 'What’s new: modules over USB')!
    await act(async () => again.click())
    expect(welcome()).toBeDefined()
  }, 15000)
  it('and the beta invitation never open together', async () => {
    placesLeft = 5
    await open('library')
    await vi.waitFor(() => expect(welcome()).toBeDefined(), { timeout: 4000 })
    expect(document.querySelector('dialog.beta-join')).toBeNull()
    await act(async () => button(welcome()!, 'Later')!.click())
    await wait(2000)
    expect(document.querySelector('dialog.beta-join')).toBeNull() // not on the visit the welcome opened
    await reload('library'); await vi.waitFor(() => expect(document.querySelector('dialog.beta-join[open]')).not.toBeNull(), { timeout: 4000 })
    expect(welcome()).toBeUndefined()
  }, 20000)
})
