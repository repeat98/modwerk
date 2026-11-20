// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MoreModsPrompt, moreModsKey } from './MoreModsPrompt'
import { DEVICES_BY_ID } from '../devices/registry'

let root: Root, container: HTMLDivElement
const digitakt = DEVICES_BY_ID['digitakt-ii'], digitone = DEVICES_BY_ID.digitone
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); localStorage.clear()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function render(device = digitakt, count?: number) {
  await act(() => root.render(createElement(MoreModsPrompt, { key: device.id, device, count })))
  await act(() => vi.advanceTimersByTimeAsync(1600))
}
const control = (name: string) => [...container.querySelectorAll<HTMLElement>('button, a')].find(item => item.textContent === name)

it('invites a visitor to Start developing with this machine chosen', async () => {
  await render(digitakt, 4)
  expect(container.querySelector('dialog[open]')).not.toBeNull()
  expect(container.textContent).toContain('Want to see more mods here? Get active.')
  expect(container.textContent).toContain('The Digitakt II has 4 mods so far, all in preview.')
  expect(control('Get active')?.getAttribute('href')).toBe('#submit?machine=digitakt-ii')
  await act(() => control('Get active')!.click())
  expect(localStorage.getItem(moreModsKey('digitakt-ii'))).toBe('active')
})

it('asks once per machine: Not now keeps it closed there, another machine still asks', async () => {
  await render(digitakt, 1)
  expect(container.textContent).toContain('has one mod so far')
  await act(() => control('Not now')!.click())
  expect(container.querySelector('dialog')).toBeNull()
  await act(() => root.unmount()); root = createRoot(container); await render(digitakt, 1)
  expect(container.querySelector('dialog')).toBeNull()
  await render(digitone)
  expect(container.textContent).toContain('The Digitone has its first mods, still in preview.')
})

it('waits while another dialog is open', async () => {
  const other = document.createElement('dialog'); other.setAttribute('open', ''); document.body.append(other)
  await render()
  expect(container.querySelector('dialog')).toBeNull()
  other.remove(); await act(() => vi.advanceTimersByTimeAsync(1600))
  expect(container.querySelector('dialog[open]')).not.toBeNull()
})
