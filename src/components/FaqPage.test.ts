// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FaqPage } from './FaqPage'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const answer = (id: string) => container.querySelector<HTMLDetailsElement>('#faq-' + id)

it('opens the answer a #faq/<id> link names and leaves the others as they were', async () => {
  await act(() => root.render(createElement(FaqPage, {open: 'digi-recovery'})))
  expect(answer('digi-recovery')?.open).toBe(true)
  expect(answer('digi-recovery')?.textContent).toContain('How do I recover a Digitakt, Digitakt II, Digitone or Analog Rytm MKII that will not boot?')
  expect(answer('digi-flashing')?.open).toBe(false)
  expect(answer('base-firmware')?.open).toBe(true)
})

it('opens no extra answer without one, or for an id it does not have', async () => {
  await act(() => root.render(createElement(FaqPage, {open: 'no-such-question'})))
  expect(answer('digi-recovery')?.open).toBe(false)
  expect([...container.querySelectorAll('details[open]')].map(item => item.id)).toEqual(['faq-base-firmware'])
})
