// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GetStarted } from './GetStarted'

vi.mock('./context', () => ({ useCommunity: () => ({ session: { user: { id: 'member', verified: true, username: 'member', displayName: 'Member' } } }) }))
vi.mock('./api', () => ({ api: () => new Promise(() => {}) }))
vi.mock('./push-client', () => ({ pushSupported: () => false }))

it('opens on a first desktop visit and can be reopened on return even if progress never loaded', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const toggle = () => container.querySelector<HTMLButtonElement>('.get-started-toggle')!
  try {
    await act(() => root.render(createElement(GetStarted)))
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    await act(() => root.render(null))
    await act(() => root.render(createElement(GetStarted)))
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await act(() => toggle().click())
    expect(container.querySelector('ol')!.hidden).toBe(false)
  } finally {
    await act(() => root.unmount())
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
