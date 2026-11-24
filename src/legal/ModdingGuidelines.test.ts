// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ModdingGuidelines } from './ModdingGuidelines'

it('focuses a linked guideline and closes the phone index after a selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const target = 'modding-guidelines/keep-a-way-back'
  try {
    await act(() => root.render(createElement(ModdingGuidelines)))
    const heading = document.getElementById(target)!
    heading.scrollIntoView = vi.fn()
    const button = host.querySelector<HTMLButtonElement>('nav button')!
    await act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const link = host.querySelector<HTMLAnchorElement>(`a[href="#${target}"]`)!
    await act(() => link.click())
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await act(() => root.render(createElement(ModdingGuidelines, { activeTopic: target })))
    expect(document.activeElement).toBe(heading)
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(link.getAttribute('aria-current')).toBe('location')
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
