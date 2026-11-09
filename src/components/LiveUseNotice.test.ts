// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { LiveUseNotice } from './LiveUseNotice'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

const toggle = () => container.querySelector<HTMLButtonElement>('.live-use-toggle')!
const panel = () => container.querySelector<HTMLElement>('.live-use-panel')!

it('shows the live-use pill folded, opens the advice and closes it again', () => {
  act(() => root.render(createElement(LiveUseNotice)))
  expect(toggle().getAttribute('aria-label')).toBe('Playing live? Take care')
  expect(toggle().getAttribute('aria-expanded')).toBe('false')
  expect(panel().hidden).toBe(true)
  act(() => toggle().click())
  expect(panel().hidden).toBe(false)
  expect(panel().textContent).toContain('play it on the official OS')
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(panel().hidden).toBe(true)
  expect(document.activeElement).toBe(toggle())
  act(() => toggle().click())
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(panel().hidden).toBe(true)
})

it('has no way to dismiss the reminder for good', () => {
  act(() => root.render(createElement(LiveUseNotice)))
  act(() => toggle().click())
  act(() => container.querySelector<HTMLButtonElement>('.live-use-panel .icon-button')!.click())
  expect(toggle()).not.toBeNull()
  expect(panel().hidden).toBe(true)
})

it('is mounted once in the app shell, on every route', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  expect(app.match(/<LiveUseNotice \/>/g)).toHaveLength(1)
  expect(app).toMatch(/\n {8}<LiveUseNotice \/>\n/)
})
