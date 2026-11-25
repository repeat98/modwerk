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
  expect(container.querySelector('.base-latest-release .base-release-version')?.textContent).toBe(CURRENT_BASE_VERSION)
  for (const [machine, note] of [['Octatrack', 'octatrack'], ['MS-70CDR', 'midistomp'], ['Analog Rytm', 'rytm']]) {
    await choose(machine)
    const log = container.querySelector('.base-changelog')!
    const latest = log.querySelector<HTMLAnchorElement>('.base-latest-release .base-release-source')!
    expect(latest.href).toContain(note)
    expect(latest.closest('details')).toBeNull()
    expect(log.querySelectorAll('.base-archived-release').length).toBeGreaterThan(0)
    for (const link of log.querySelectorAll<HTMLAnchorElement>('a')) {
      const file = new URL(link.href).pathname.split('/changelog/')[1]
      expect(existsSync(join(process.cwd(), 'changelog', file)), file).toBe(true)
    }
  }
  await choose('Others')
  expect(container.querySelector('.base-changelog')).toBeNull()
})

it('shows a top-to-bottom stack with the original OS for the selected instrument', async () => {
  await render()
  const stack = () => container.querySelector('.base-stack')!
  expect([...stack().querySelectorAll('dt')].map(layer => layer.textContent)).toEqual(['Modules', 'Modwerk base', 'Original OS'])
  expect(stack().textContent).toContain('OS 1.40C')
  await choose('MS-70CDR')
  expect(stack().textContent).toContain('Zoom 2.10 updater')
  await choose('Analog Rytm')
  expect(stack().textContent).toContain('OS 1.74')
  await choose('Others')
  expect(container.querySelector('.base-stack')).toBeNull()
})

it('leads with on-device controls and keeps installation prerequisites visible above the task instructions', async () => {
  await render()
  expect(container.querySelector('.base-device a')?.getAttribute('href')).toBe('#octatrack/setup')
  const controls = container.querySelector('.ot-controls')!
  const history = container.querySelector('.base-changelog')!
  expect(controls.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(container.querySelector('.ot-intro .base-stack-diagram img')?.getAttribute('src')).toContain('firmware-stack.svg')
  expect(controls.querySelector(':scope > ul img')?.getAttribute('src')).toContain('ot-project-menu.png')
  expect(controls.querySelectorAll(':scope > ul img')).toHaveLength(6)
  await act(() => container.querySelector<HTMLButtonElement>('.ot-intro .text-button')!.click())
  expect(document.activeElement?.id).toBe('base-changelog-title')
  const prerequisites = container.querySelector('.ot-install-intro')!
  expect(prerequisites.textContent).toContain('OS 1.40C')
  expect(prerequisites.textContent).toContain('card reader or MIDI interface')
  expect(prerequisites.closest('details')).toBeNull()
  expect(prerequisites.querySelector('a[href="#octatrack/setup"]')).toBeTruthy()
  const moduleSet = container.querySelector('.ot-install-topics a[href="#faq/card-set"]')!.closest('details')!
  expect(moduleSet.textContent).toContain('Sync to Octatrack')
  const references = [...container.querySelectorAll<HTMLDetailsElement>('.base-reference')]
  expect(references.every(section => !section.open)).toBe(true)
  expect(references.find(section => section.querySelector('a[href="#faq/return-to-stock"]'))?.textContent).toContain('hold PROJ')
  await act(() => moduleSet.querySelector('summary')!.click())
  expect(moduleSet.open).toBe(true)
})
