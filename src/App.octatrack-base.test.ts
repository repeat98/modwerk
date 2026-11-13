// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CommunityContext } from './community/context'
import { DEVICES, isZd2Pedal } from './devices/registry'
import { isZoomSetDevice } from './devices/zoom-effects'
import { fakeUnit } from './dev/octatrack-link-fake'

// A production build (not a dev build) with the Octatrack base path's switch flipped per test.
const release = vi.hoisted(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) as unknown as MediaQueryList
  return { on: false }
})
vi.mock('./config/octatrack-base', () => ({ get OCTATRACK_BASE_RELEASED() { return release.on } }))
vi.mock('./engine/protocol', async original => ({ ...await original<typeof import('./engine/protocol')>(), USB_LINK: false }))

const session = { available: true, admin: false, user: { id: 'plain', displayName: 'Plain', username: 'plain', avatar: null, verified: true, betaTester: false } }
const betaPedal = DEVICES.find(device => device.family === 'zoom' && !isZd2Pedal(device) && !isZoomSetDevice(device.id))!
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  for (const name of ['scrollTo', 'scrollIntoView']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function open(hash: string) {
  window.location.hash = hash
  const value = { session, loading: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(App))))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
}

describe('releasing the Octatrack base path to a member who is not a beta tester', () => {
  it('opens the Octatrack page and module sets, and keeps beta-only Zoom pages and beta modules closed', async () => {
    release.on = true
    await open('octatrack')
    await vi.waitFor(() => expect(document.title).toContain('Your Octatrack'))
    expect(window.location.hash).toBe('#octatrack')
    expect(container.querySelector('a.configuration-button')?.getAttribute('aria-label')).toMatch(/^Open module set,/)
    await act(async () => root.unmount()); root = createRoot(container)
    await open(betaPedal.id + '/pedal')
    await vi.waitFor(() => expect(window.location.hash).toBe('#' + betaPedal.id))
    await act(async () => root.unmount()); root = createRoot(container)
    await open('module/airwindows-chorus')
    await vi.waitFor(() => expect(container.textContent).toContain('Module temporarily unavailable'))
  })
  it('offers a USB-only module in every browser: without USB it reaches the unit as the card file', async () => {
    release.on = true
    await open('module/ring-sc') // RINGMOD SC: its package needs the key bus, so only the base loads it
    await vi.waitFor(() => expect(container.querySelector('.module-configure-action')).not.toBeNull())
    expect(container.querySelector('.module-configure-action.is-blocked')).toBeNull()
    expect(container.querySelector('.add-block-detail')).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container)
    // Chrome or Edge on a computer: offered as usual, synced over USB.
    vi.stubGlobal('isSecureContext', true); Object.defineProperty(navigator, 'usb', { value: fakeUnit('none').usb, configurable: true })
    try {
      await open('module/ring-sc')
      await vi.waitFor(() => expect(container.querySelector('.module-configure-action')).not.toBeNull())
      expect(container.querySelector('.module-configure-action.is-blocked')).toBeNull()
      expect(container.querySelector('.add-block-detail')).toBeNull()
    } finally { delete (navigator as { usb?: unknown }).usb }
  })
  it('changes nothing while the switch is off', async () => {
    release.on = false
    await open('octatrack')
    await vi.waitFor(() => expect(window.location.hash).toBe('#library'))
    expect(container.querySelector('a.configuration-button')?.getAttribute('aria-label')).toMatch(/^Open configuration,/)
  })
})
