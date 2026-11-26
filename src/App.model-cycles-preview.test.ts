// @vitest-environment jsdom
// The Model:Cycles' core build preview is beta-only in a released build (USB_LINK off): its configuration route sends
// a visitor to the machine page, but only once the session has loaded, so a beta tester who opens or reloads the route
// stays on it.
import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { CommunityContext, emptySession } from './community/context'

vi.hoisted(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) as unknown as MediaQueryList
})
vi.mock('./engine/protocol', async original => ({ ...await original<typeof import('./engine/protocol')>(), USB_LINK: false }))

const tester = { ...emptySession, user: { id: 'tester', displayName: 'Tester', username: 'tester', avatar: null, verified: true, betaTester: true } }
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.stubGlobal('Worker', class { terminate = vi.fn() })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  for (const name of ['scrollTo', 'scrollIntoView']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} })
  // jsdom has the dialog element but not its methods
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function render(session: typeof emptySession, loading: boolean) {
  const value = { session, loading, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(App))))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
}

it('keeps a beta tester on the configuration route while the session loads, and sends a visitor away after', async () => {
  window.location.hash = 'model-cycles/configuration'
  await render(emptySession, true)          // a reload: no session yet
  expect(window.location.hash).toBe('#model-cycles/configuration')
  await render(tester, false)
  expect(window.location.hash).toBe('#model-cycles/configuration')
  await render(emptySession, false)         // a visitor without beta access
  expect(window.location.hash).toBe('#model-cycles')
})
