// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FaqPage } from './FaqPage'
import { RecoveryNotice } from './RecoveryNotice'
import { RECOVERY_FAQ, type RecoveryMachine } from './recovery-faq'

vi.mock('../community/usage', () => ({trackFirmwareDownload: vi.fn()}))
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const notice = (machine: RecoveryMachine) => act(() => root.render(createElement(RecoveryNotice, {machine, steps: 'Hold FUNC while powering on.', checked: false, onChange: vi.fn()})))
const link = () => container.querySelector('.recovery-notice a')

it('links every machine to a FAQ answer that exists on that machine’s FAQ, open', async () => {
  for (const [machine, id] of Object.entries(RECOVERY_FAQ)) {
    await act(() => root.render(createElement(FaqPage, {key: machine, machine, open: id})))
    expect(container.querySelector<HTMLDetailsElement>('#faq-' + id)?.open, machine).toBe(true)
  }
})

it('sends each machine to its own recovery answer, in a new tab', async () => {
  for (const [machine, href] of [['octatrack', '#faq/recover'], ['digitakt', '#faq/digi-recovery'], ['digitone', '#faq/digi-recovery']] as const) {
    await notice(machine)
    expect(link()?.getAttribute('href'), machine).toBe(href)
    expect(link()?.getAttribute('target')).toBe('_blank')
  }
})

it('says the card for the Octatrack and keeps the bootloader promise to elekloader builds', async () => {
  await notice('octatrack')
  expect(container.textContent).toContain('Flash it from the CompactFlash card')
  expect(container.textContent).not.toContain('bootloader')
  await notice('digitakt')
  expect(container.textContent).toContain('the bootloader is never touched')
  expect(container.textContent).toContain('Elektron Transfer')
})
