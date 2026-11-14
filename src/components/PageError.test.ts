// @vitest-environment jsdom
import { act, createElement, lazy } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadForNewRelease } from './chunk-load-error'
import { LazyPanel, PageError } from './PageError'
import { RenderBoundary } from './RenderBoundary'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const staleChunk = () => new TypeError('Failed to fetch dynamically imported module: https://modwerk.example/assets/CompatibilityPanel-1a2b3c.js')
function Broken({ message = 'boom' }: { message?: string }): never { throw new Error(message) }

describe('failed lazy-loaded parts', () => {
  it('recognises a part that did not arrive in every browser’s words', () => {
    expect(isChunkLoadError(staleChunk())).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://modwerk.example/assets/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' }))).toBe(true)
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'length')"))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })

  it('explains a missing part and a real fault differently, and offers a reload either way', () => {
    const missing = renderToStaticMarkup(createElement(PageError, { error: staleChunk() }))
    expect(missing).toContain('This page could not be loaded')
    expect(missing).toContain('a newer version may have been released')
    expect(missing).toContain('Reload page')
    expect(missing).toContain('href="#library"')
    const fault = renderToStaticMarkup(createElement(PageError, { error: new TypeError("Cannot read properties of undefined (reading 'length')") }))
    expect(fault).toContain('Something went wrong on this page')
    expect(fault).not.toContain('newer version')
    expect(fault).toContain('TypeError: Cannot read properties of undefined (reading &#x27;length&#x27;)')
    const app = renderToStaticMarkup(createElement(PageError, { error: new Error('x'), scope: 'app' }))
    expect(app).toContain('Reload page')
    expect(app).not.toContain('href="#library"')
    expect(renderToStaticMarkup(createElement(PageError, { error: 'not an Error' }))).not.toContain('Technical details')
  })

  it('reloads once for a new release, never again within a minute and never offline', () => {
    sessionStorage.clear()
    const reload = vi.fn()
    expect(reloadForNewRelease(reload, 1_000_000)).toBe(true)
    expect(reloadForNewRelease(reload, 1_030_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(reloadForNewRelease(reload, 2_000_000)).toBe(false)
    vi.restoreAllMocks()
    expect(reloadForNewRelease(reload, 2_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('keeps the page and its other parts when the compatibility panel’s file does not arrive', async () => {
    const CompatibilityPanel = lazy(() => Promise.reject(staleChunk()))
    function Configuration() {
      return createElement('div', null,
        createElement('nav', null, 'Module library'),
        createElement('h1', null, 'My first configuration'),
        createElement(LazyPanel, { name: 'Compatibility details', children: createElement(CompatibilityPanel) }),
        createElement('button', null, 'Build firmware'))
    }
    await act(async () => root.render(createElement(Configuration)))
    expect(container.querySelector('nav')?.textContent).toBe('Module library')
    expect(container.querySelector('h1')?.textContent).toBe('My first configuration')
    expect(container.querySelector('button')?.textContent).toBe('Build firmware')
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Compatibility details could not be loaded. Reload the page to try again.')
  })
})

describe('a page that fails to render', () => {
  const App = ({ route, fail }: { route: string; fail: boolean }) => createElement('div', null,
    createElement('nav', null, 'Sidebar'),
    createElement(RenderBoundary, { resetKey: route, fallback: (error: unknown) => createElement(PageError, { error }), children: fail ? createElement(Broken, { message: 'page exploded' }) : createElement('p', null, 'Page for ' + route) }))

  it('leaves the sidebar mounted instead of an empty page, and shows what failed', async () => {
    await act(async () => root.render(createElement(App, { route: 'configuration', fail: true })))
    expect(container.querySelector('nav')?.textContent).toBe('Sidebar')
    expect(container.querySelector('[role=alert] h1')?.textContent).toBe('Something went wrong on this page')
    expect(container.querySelector('pre')?.textContent).toBe('Error: page exploded')
  })

  it('opens the next page normally, and stays on the error while the route is unchanged', async () => {
    await act(async () => root.render(createElement(App, { route: 'configuration', fail: true })))
    await act(async () => root.render(createElement(App, { route: 'configuration', fail: false })))
    expect(container.querySelector('[role=alert]')).not.toBeNull()
    await act(async () => root.render(createElement(App, { route: 'library', fail: false })))
    expect(container.querySelector('[role=alert]')).toBeNull()
    expect(container.querySelector('p')?.textContent).toBe('Page for library')
    expect(container.querySelector('nav')?.textContent).toBe('Sidebar')
  })

  it('keeps the children mounted across a route change when nothing failed', async () => {
    const page = (route: string) => createElement(RenderBoundary, { resetKey: route, fallback: createElement('p', null, 'failed'), children: createElement('output', null, 'Library') })
    await act(async () => root.render(page('a')))
    const first = container.querySelector('output')
    await act(async () => root.render(page('b')))
    expect(container.querySelector('output')).toBe(first)
  })
})
