// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CURRENT_BASE_VERSION } from '../engine/elekloader/base-variants'
import { BasePage } from './BasePage'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (machine?: string) => act(() => root.render(createElement(BasePage, { machine })))
const shown = () => [...container.querySelectorAll('.base-section-heading h2')].map(heading => heading.id)
const pressed = () => container.querySelector('.faq-machines [aria-pressed="true"]')?.textContent
const choose = (label: string) => act(() => [...container.querySelectorAll<HTMLButtonElement>('.faq-machines button')].find(button => button.textContent === label)!.click())

it('shows one machine at a time, the visitor’s own first, as the FAQ does', async () => {
  await render()
  expect(container.querySelector('h1')?.textContent).toBe('Base firmware')
  expect([pressed(), shown()]).toEqual(['Octatrack', ['base-octatrack']])
  await choose('MS-70CDR')
  expect([pressed(), shown()]).toEqual(['MS-70CDR', ['base-zoom']])
  await act(() => root.unmount()); root = createRoot(container)
  await render('analog-rytm-mkii')
  expect(shown()).toEqual(['base-rytm'])
  await act(() => root.unmount()); root = createRoot(container)
  await render('digitakt')
  expect([pressed(), shown()]).toEqual(['Others', ['base-others']])
})

it('links each machine onward and shows its screens from pictures that ship with the site', async () => {
  await render()
  const links: string[] = [], images: HTMLImageElement[] = []
  for (const label of ['Octatrack', 'MS-70CDR', 'Analog Rytm', 'Others']) {
    await choose(label)
    links.push(...[...container.querySelectorAll<HTMLAnchorElement>('.base-actions a')].map(link => link.getAttribute('href')!))
    images.push(...container.querySelectorAll<HTMLImageElement>('.base-lcd img'))
  }
  expect(links).toEqual(expect.arrayContaining(['#octatrack/setup', '#zoom-ms-70cdr/pedal', '#analog-rytm-mkii']))
  expect(images.length).toBeGreaterThanOrEqual(9)
  for (const image of images) {
    expect(image.alt.length).toBeGreaterThan(10)
    const file = image.getAttribute('src')!.replace(/^.*\/base\//, '')
    expect(existsSync(join(process.cwd(), 'public', 'base', file)), file).toBe(true)
  }
})

it('lists the other instruments without repeating the three that have their own view', async () => {
  await render('digitakt')
  const names = [...container.querySelectorAll('.base-machines strong')].map(name => name.textContent)
  expect(names.length).toBeGreaterThan(3)
  expect(names.filter(name => name?.startsWith('Octatrack') || name?.includes('MS-70CDR') || name === 'Analog Rytm MKII')).toEqual([])
  expect(names).toContain('Analog Rytm MKI')
})

it('shows the newest change for the chosen base and links earlier changes to shipped notes', async () => {
  await render()
  expect(container.querySelector('.base-changelog > dl dt')?.textContent).toBe(CURRENT_BASE_VERSION)
  for (const [machine, note] of [['Octatrack', 'octatrack'], ['MS-70CDR', 'midistomp'], ['Analog Rytm', 'rytm']]) {
    await choose(machine)
    const log = container.querySelector('.base-changelog')!
    const latest = log.querySelector<HTMLAnchorElement>(':scope > dl a')!
    expect(latest.href).toContain(note)
    expect(latest.closest('details')).toBeNull()
    expect(log.querySelectorAll('details .base-change').length).toBeGreaterThan(0)
    for (const link of log.querySelectorAll<HTMLAnchorElement>('a')) {
      const file = new URL(link.href).pathname.split('/changelog/')[1]
      expect(existsSync(join(process.cwd(), 'changelog', file)), file).toBe(true)
    }
  }
  await choose('Others')
  expect(container.querySelector('.base-changelog')).toBeNull()
})

it('puts setup and recovery prerequisites before the optional Octatrack references', async () => {
  await render()
  expect(container.querySelector('.base-device a')?.getAttribute('href')).toBe('#octatrack/setup')
  expect(container.querySelector('.base-facts')?.textContent).toContain('OS 1.40C')
  expect(container.querySelector('.base-facts')?.textContent).toContain('card reader or MIDI interface')
  expect(container.querySelector('.base-definition')?.textContent).toContain('original operating system')
  expect(container.querySelector('.base-workflow')?.closest('details')).toBeNull()
  expect(container.querySelector('.base-workflow')?.textContent).toContain('Sync to Octatrack')
  const references = [...container.querySelectorAll<HTMLDetailsElement>('.base-reference')]
  expect(references.every(section => !section.open)).toBe(true)
  expect(references.find(section => section.querySelector('a[href="#faq/return-to-stock"]'))?.textContent).toContain('hold PROJ')
})
