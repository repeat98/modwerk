// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FaqPage } from './FaqPage'
import { FAQ_ALIASES, FAQ_MACHINES, faqQuickStart, faqSections } from './faq-content'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const answer = (id: string) => container.querySelector<HTMLDetailsElement>('#faq-' + id)
const render = (props: Parameters<typeof FaqPage>[0] = {}) => act(() => root.render(createElement(FaqPage, props)))
const pressed = () => container.querySelector('.faq-machines [aria-pressed="true"]')?.textContent
const machineButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('.faq-machines button')].find(button => button.textContent === label)!
async function search(text: string) {
  const input = container.querySelector<HTMLInputElement>('.faq-search input')!
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', {bubbles: true})) })
}

it('opens the answer a #faq/<id> link names and leaves the others closed', async () => {
  await render({open: 'recover'})
  expect(answer('recover')?.open).toBe(true)
  expect(answer('recover')?.textContent).toContain('How do I recover an Octatrack that will not boot?')
  expect([...container.querySelectorAll('details[open]')].map(item => item.id)).toEqual(['faq-recover'])
})

it('opens no answer without a link, or for an id it does not have', async () => {
  await render({open: 'no-such-question'})
  expect(container.querySelectorAll('details[open]')).toHaveLength(0)
  expect(container.querySelectorAll('details').length).toBeGreaterThan(20)
})

it('shows the visitor’s machine, and the machine an answer belongs to when a link names one', async () => {
  await render()
  expect(pressed()).toBe('Octatrack')
  await act(() => root.render(createElement(FaqPage, {key: 'rytm', machine: 'analog-rytm-mkii'})))
  expect(pressed()).toBe('Analog Rytm')
  expect(container.textContent).toContain('Put mods on your Analog Rytm MKII')
  expect(answer('usb-base')).toBeNull()
  // The Octatrack is selected on the site, the link names a Digitakt answer.
  await act(() => root.render(createElement(FaqPage, {key: 'digi', machine: 'octatrack', open: 'digi-recovery'})))
  expect(pressed()).toBe('Digitakt & Digitone')
  expect(answer('digi-recovery')?.open).toBe(true)
})

it('switches machine from the page', async () => {
  await render()
  expect(answer('usb-base')).not.toBeNull()
  await act(() => machineButton('Digitakt & Digitone').click())
  expect(answer('usb-base')).toBeNull()
  expect(answer('digi-flashing')?.textContent).toContain('Elektron Transfer')
  expect(container.querySelector('.faq-quick h2')?.textContent).toBe('Put mods on your Digitakt or Digitone')
})

it('answers how to install mods on an Octatrack: the base once from the card, then a USB sync or the card file', async () => {
  await render({open: 'usb-base'})
  const text = answer('usb-base')!.textContent!
  expect(answer('usb-base')?.open).toBe(true)
  expect(text).toContain('You need an Octatrack MKI or MKII')
  expect(text).toContain('The first install always goes through the card')
  expect(text).toContain('USB DISK MODE or with a card reader')
  expect(text).toContain('another Chromium browser')
  expect(text).toContain('Sync to Octatrack')
  expect(text).toContain('without the card and without a restart')
  expect(text).toContain('Load from the card')
  expect(text).toContain('MODWERK0.SET')
  expect(answer('base')?.textContent).toContain('Every later base update goes over USB, with the card as the fallback.')
  expect(answer('cant-connect')?.textContent).toContain('Report a problem on the Your Octatrack page')
})

it('keeps the quick start and its caution in view, and leads to the full steps', async () => {
  await render()
  const quick = container.querySelector('.faq-quick')!
  expect([...quick.querySelectorAll('li strong')].map(item => item.textContent)).toEqual(['Install the base once', 'Pick your modules', 'Sync over USB'])
  expect(quick.querySelector('.faq-quick-caution')?.textContent).toContain('CompactFlash card reader or a MIDI interface')
  expect(quick.querySelector('.faq-quick-caution a')?.getAttribute('href')).toBe('#faq/usb-base')
  expect(quick.querySelector('a.button-primary')?.getAttribute('href')).toBe('#octatrack/setup')
})

it('searches the selected machine and points to answers only another machine has', async () => {
  await render()
  await search('transfer drop')
  expect(container.querySelector('.faq-results')?.textContent).toContain('0 answers for the Octatrack')
  expect(container.textContent).toContain('No answers found')
  const more = [...container.querySelectorAll<HTMLButtonElement>('.faq-results button')]
  expect(more.map(button => button.textContent)).toEqual(['1 more for Digitakt & Digitone', '1 more for Analog Rytm'])
  await act(() => more[0].click())
  expect(pressed()).toBe('Digitakt & Digitone')
  expect([...container.querySelectorAll('details')].map(item => item.id)).toEqual(['faq-digi-flashing'])
  expect(answer('digi-flashing')?.open).toBe(true)
  expect(container.querySelector('.faq-quick')).toBeNull()
})

it('opens an answer that was renamed from its old link', async () => {
  await render({open: 'flash-card'})
  expect(answer('return-to-stock')?.open).toBe(true)
})

it('gives every machine unique answer ids, links that lead to an answer, and a quick start that does too', () => {
  for (const {id: machine} of FAQ_MACHINES) {
    const ids = faqSections(machine).flatMap(section => section.questions.map(question => question.id))
    expect(new Set(ids).size, machine).toBe(ids.length)
    expect(ids, machine).toContain(faqQuickStart(machine).more)
    for (const target of Object.values(FAQ_ALIASES)) expect(FAQ_MACHINES.some(item => faqSections(item.id).some(section => section.questions.some(question => question.id === target))), target).toBe(true)
  }
})

it('links between answers only to answers on the same machine’s page', async () => {
  for (const {id: machine, label} of FAQ_MACHINES) {
    await act(() => root.render(createElement(FaqPage, {key: machine})))
    await act(() => machineButton(label).click())
    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href^="#faq/"]')) expect(answer(link.getAttribute('href')!.slice(5)), machine + ' ' + link.getAttribute('href')).not.toBeNull()
  }
})
