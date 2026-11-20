// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryResultsBar } from './LibraryResultsBar'
import { MobileMenu } from './MobileMenu'
import { MachineSwitcher } from '../devices/MachineSwitcher'
import { DEVICES_BY_ID } from '../devices/registry'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (name: string) => [...document.querySelectorAll('button')].find(button => button.textContent === name)!
const key = (element: Element, key: string, shiftKey = false) => act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })) })
const bar = { summary: '3 modules · Octatrack', sort: 'updated', onSortChange: vi.fn(), family: 'all', onFamilyChange: vi.fn(), families: [{ value: 'Scenes', count: 1 }], allCount: 3 }

describe('phone sheet keyboard interaction', () => {
  it('isolates the sheet, cycles keyboard focus and restores focus after Escape', async () => {
    await act(() => root.render(createElement(LibraryResultsBar, bar)))
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Type: all types"]')!
    await click(trigger)
    const sheet = document.querySelector('[role="dialog"]')!
    expect(container.hasAttribute('inert')).toBe(true)
    const buttons = [...sheet.querySelectorAll('button')]
    expect(document.activeElement).toBe(buttons[1])
    buttons[0].focus(); await key(buttons[0], 'Tab', true)
    expect(document.activeElement).toBe(buttons.at(-1))
    await key(buttons.at(-1)!, 'Tab')
    expect(document.activeElement).toBe(buttons[0])
    await key(buttons[0], 'ArrowUp')
    expect(document.activeElement).toBe(buttons.at(-1))
    await key(buttons.at(-1)!, 'ArrowDown')
    expect(document.activeElement).toBe(buttons[1])
    await key(buttons[0], 'Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
  it('returns focus after choosing an option or dismissing the scrim', async () => {
    await act(() => root.render(createElement(LibraryResultsBar, bar)))
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Type: all types"]')!
    await click(trigger); await click(buttonNamed('Scenes1'))
    expect(bar.onFamilyChange).toHaveBeenCalledWith('Scenes')
    expect(document.activeElement).toBe(trigger)
    await click(trigger); await click(document.querySelector('.sheet-scrim')!)
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).not.toBe('hidden')
  })
  it('sorts by downloads over a period from the sort sheet', async () => {
    await act(() => root.render(createElement(LibraryResultsBar, { ...bar, sort: 'downloaded-30' })))
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Sort: Most downloaded, last 30 days"]')!
    await click(trigger)
    const periods = [...document.querySelectorAll('.library-sheet-periods button')]
    expect(periods.map(button => button.textContent)).toEqual(['7 days', '30 days', '90 days', 'All time'])
    expect(periods.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    await click(buttonNamed('7 days'))
    expect(bar.onSortChange).toHaveBeenCalledWith('downloaded-7')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('redirects outside focus and preserves elements that were already inert', async () => {
    const covered = document.createElement('aside'), outside = document.createElement('button')
    covered.setAttribute('inert', ''); covered.append(outside); document.body.append(covered)
    try {
      await act(() => root.render(createElement(LibraryResultsBar, bar)))
      await click(container.querySelector('[aria-label="Type: all types"]')!)
      const sheet = document.querySelector('[role="dialog"]')!
      outside.focus()
      expect(sheet.contains(document.activeElement)).toBe(true)
      await key(document.activeElement!, 'Escape')
      expect(covered.hasAttribute('inert')).toBe(true)
      expect(container.hasAttribute('inert')).toBe(false)
    } finally { covered.remove() }
  })
  it('moves focus into a modal menu and restores its trigger on scrim dismissal', async () => {
    await act(() => root.render(createElement(MobileMenu, { route: 'all', selectedCount: 0, admin: false })))
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Menu"]')!
    await click(trigger)
    const panel = document.querySelector('#mobile-menu-panel')!
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(container.hasAttribute('inert')).toBe(true)
    await click(document.querySelector('.mobile-menu-scrim')!)
    expect(document.activeElement).toBe(trigger)
    expect(container.hasAttribute('inert')).toBe(false)
  })
  it('focuses and contains the compact machine chooser, then dismisses on Escape', async () => {
    await act(() => root.render(createElement(MachineSwitcher, { current: DEVICES_BY_ID.octatrack, all: false, counts: { octatrack: 3 }, compact: true })))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    await click(trigger)
    const panel = document.querySelector('[role="dialog"]')!
    expect(container.hasAttribute('inert')).toBe(true)
    expect(document.activeElement?.getAttribute('aria-current')).toBe('true')
    const buttons = [...panel.querySelectorAll<HTMLElement>('button, a')]
    buttons.at(-1)!.focus(); await key(buttons.at(-1)!, 'Tab')
    expect(document.activeElement).toBe(buttons[0])
    await key(buttons[0], 'ArrowUp')
    expect(document.activeElement).toBe(buttons.at(-1))
    await key(buttons[0], 'Escape')
    expect(document.activeElement).toBe(trigger)
    expect(container.hasAttribute('inert')).toBe(false)
  })
  it('releases the page when the navigation layout changes', async () => {
    await act(() => root.render(createElement(MobileMenu, { route: 'all', selectedCount: 0, admin: false })))
    await click(container.querySelector('[aria-label="Menu"]')!)
    expect(document.body.style.overflow).toBe('hidden')
    await act(() => { window.dispatchEvent(new Event('resize')) })
    expect(document.querySelector('#mobile-menu-panel')).toBeNull()
    expect(container.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
