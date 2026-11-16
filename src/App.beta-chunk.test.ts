// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PageError } from './components/PageError'
import { RenderBoundary } from './components/RenderBoundary'

vi.hoisted(() => { window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) as unknown as MediaQueryList })
// A tab opened before a release asks for the beta chunk the release replaced; the answer takes a moment, as over the network.
// Vitest wraps an error thrown by the factory itself, so the browser's error comes from the components the app reads off the chunk.
vi.mock('./components/beta', async () => { await new Promise(resolve => setTimeout(resolve, 20)); return new Proxy({}, { get: (_, key) => { if (typeof key === 'string' && /^[A-Z]/.test(key)) throw new TypeError('Failed to fetch dynamically imported module: https://modwerk.example/assets/beta-1a2b3c.js') } }) })

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  for (const name of ['scrollTo', 'scrollIntoView']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('a beta chunk that does not arrive', () => {
  it('reloads once for the new release, and shows the reload screen, as main.tsx mounts the app', async () => {
    window.location.hash = 'library'
    sessionStorage.clear()
    await act(async () => root.render(createElement(RenderBoundary, { fallback: (error: unknown) => createElement(PageError, { error, scope: 'app' }), children: createElement(App) })))
    await vi.waitFor(() => expect(container.querySelector('[role=alert] h1')?.textContent).toBe('This page could not be loaded'))
    expect(container.querySelector('[role=alert] button')?.textContent).toBe('Reload page')
    // PageError sets the flag in an effect, which can run after the heading is already on screen.
    await vi.waitFor(() => expect(sessionStorage.getItem('modwerk-reloaded-for-release')).not.toBeNull())
  })
  // The USB kit and the Zoom link import the chunk outside React.lazy: unhandled, the failure reaches the site diagnostics as an unhandled rejection.
  it('handles the chunk requests made outside React.lazy', () => {
    const requests = readFileSync('src/App.tsx', 'utf8').match(/void beta\(\)[^\n]*/g) ?? []
    expect(requests).toHaveLength(2)
    for (const request of requests) expect(request).toMatch(/\)\)\.catch\(console\.error\) \}/)
  })
})
