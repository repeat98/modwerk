// @vitest-environment jsdom
import { act, createElement } from 'react'
import { Blob as NodeBlob } from 'node:buffer'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import 'fake-indexeddb/auto'
import { deviceStore, openDeviceDatabase } from '../storage/device'
import { newConfiguration } from '../config/workspace'
import { DigiConfiguration } from '../devices/MachinePages'
import { DEVICES_BY_ID } from '../devices/registry'
import type { DigiMod } from '../devices/digi-mods'
import { OctatrackHub } from './OctatrackHub'
import { LibraryDock } from './LibraryDock'
import { LibraryTools } from './LibraryTools'
import { MOBILE_WORKSPACE } from '../hooks/useMobileWorkspace'

const media = vi.hoisted(() => {
  const state = { mobile: true, listeners: new Set<() => void>() }
  window.matchMedia = (query: string) => ({ matches: state.mobile && (query.includes('max-width: 600px') || query.includes('pointer: coarse')), media: query, onchange: null, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => true, addEventListener: (_: string, callback: () => void) => { state.listeners.add(callback) }, removeEventListener: (_: string, callback: () => void) => { state.listeners.delete(callback) } }) as unknown as MediaQueryList
  return state
})
vi.mock('../hooks/firmware-client', async original => ({ ...await original<typeof import('../hooks/firmware-client')>(), createObservedDigiFirmwareClient: () => { throw new Error('Mobile must not initialize the firmware worker') } }))
vi.mock('../community/beta-access', async original => ({ ...await original<typeof import('../community/beta-access')>(), hasBetaUi: () => false }))
const noop = () => {}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  media.mobile = true
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.spyOn(window, 'scrollTo').mockImplementation(noop)
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: noop })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(noop)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(noop)
  localStorage.clear(); sessionStorage.clear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); media.listeners.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent === name)!
const noFirmware = () => {
  expect(container.querySelector('input[accept=".bin"],input[accept*=".syx"],.firmware-drop,.risk-acceptance,.build-panel,.hub-sync')).toBeNull()
  expect([...container.querySelectorAll('button,a')].filter(item => /^(Build firmware|Download firmware|Install (the|latest)|Sync to Octatrack|Choose file)/.test(item.textContent ?? ''))).toHaveLength(0)
}

describe('mobile configuration workspaces', () => {
  it('keeps classic Octatrack configuration editing and export available without firmware or sign-in controls', async () => {
    const configuration = { ...newConfiguration('Phone set', ['miniverb']), classicStartup: true }
    const database = await openDeviceDatabase(), store = deviceStore(database)
    await store.saveConfiguration(configuration); await store.setActiveConfiguration(configuration.id); database.close()
    let exported: Blob | undefined
    vi.stubGlobal('Blob', NodeBlob)
    const createURL = vi.fn((blob: Blob) => { exported = blob; return 'blob:configuration' })
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createURL; static revokeObjectURL = noop })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(noop)
    window.location.hash = 'configuration'
    await act(async () => root.render(createElement(App)))
    await vi.waitFor(() => expect(container.querySelector('input[aria-label="Import configuration backup"]')).not.toBeNull())
    noFirmware()
    expect(container.textContent).toContain('Changes save automatically on this device')
    expect(button('Export configuration JSON').disabled).toBe(false)
    await act(() => button('Export configuration JSON').click())
    expect(createURL).toHaveBeenCalledOnce()
    expect(JSON.parse(await exported!.text())).toMatchObject({ name: 'Phone set', options: { classicStartup: true }, modules: [{ id: 'miniverb' }] })
    expect(container.querySelector('a[href="#forum"]')).not.toBeNull()
    expect(container.querySelector('a[href="#library"]')).not.toBeNull()
    await vi.waitFor(() => expect(container.querySelector('.compatibility-panel')).not.toBeNull())
    await act(() => { media.mobile = false; media.listeners.forEach(listener => listener()) })
    expect(container.querySelector('input[accept=".bin"]')).not.toBeNull()
  })

  it.each(['digitakt', 'digitone'] as const)('retains %s selection, compatibility and JSON actions without starting a firmware worker', async id => {
    const device = DEVICES_BY_ID[id] as typeof DEVICES_BY_ID[string] & { id: DigiMod['device'] }
    const configuration = newConfiguration('Mobile set', [], true, undefined, id), onDialog = vi.fn()
    await act(() => root.render(createElement(DigiConfiguration, { device, configuration, configurations: [configuration], onSelect: noop, onDialog, onToggle: noop, onImport: noop, onStorageLock: noop, onReport: noop })))
    noFirmware()
    expect(container.querySelector('input[accept="application/json,.json"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Choose configuration"]')).not.toBeNull()
    expect(container.querySelector('.compatibility-panel')?.textContent).toContain('Choose your modules')
    expect(button('Export configuration JSON').disabled).toBe(false)
    await act(() => button('New').click())
    expect(onDialog).toHaveBeenCalledWith('create')
  })

  it.each(['set', 'setup', 'status', 'backups', 'samples'] as const)('opens the beta set editor from %s, with export and forum sharing but no unit panels', async view => {
    const set = newConfiguration('Live', ['miniverb']), onSetAction = vi.fn(), onInstall = vi.fn(), onSync = vi.fn(), onImport = vi.fn()
    await act(() => root.render(createElement(OctatrackHub, { view, link: null, sets: [set], selectedId: set.id, onSelect: noop, onNew: noop, onImport, onSetAction, onInstall, onSync, onFill: noop, onSaveUnit: noop, onReport: noop, header: null, grid: createElement('a', { href: '#library' }, 'Add modules'), card: createElement('input', { type: 'file', accept: '.bin' }) })))
    noFirmware()
    expect(container.querySelector('.hub-view-setup,.hub-view-status,.hub-view-backups,.hub-view-samples')).toBeNull()
    expect(container.textContent).toContain('Live')
    await act(() => button('Export configuration JSON').click())
    expect(onSetAction).toHaveBeenCalledWith(set.id, 'export')
    await act(() => button('Import JSON').click())
    expect(onImport).toHaveBeenCalledOnce()
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Live actions"]')!.click())
    await act(() => button('Share in forum').click())
    expect(onSetAction).toHaveBeenCalledWith(set.id, 'share')
    expect(onInstall).not.toHaveBeenCalled(); expect(onSync).not.toHaveBeenCalled()
  })

  it('updates library actions when the workspace changes between mobile and desktop', async () => {
    const props = { family: 'all', families: [], onFamilyChange: noop, sort: 'updated', onSortChange: noop, comparisonCount: 0, onCompare: noop, buildLabel: 'Build firmware for Digitakt', buildHref: '#digitakt/configuration' }
    await act(() => root.render(createElement('div', null, createElement(LibraryTools, props), createElement(LibraryDock, { compared: [], onClearComparison: noop, onCompare: noop, build: { count: 1, detail: 'Digitakt', href: '#digitakt/configuration' } }))))
    expect(container.querySelectorAll('a[href="#digitakt/configuration"]')).toHaveLength(2)
    for (const anchor of container.querySelectorAll('a')) { expect(anchor.textContent).toBe('Open configuration'); expect(anchor.getAttribute('aria-label')).toBeNull() }
    await act(() => { media.mobile = false; media.listeners.forEach(listener => listener()) })
    for (const anchor of container.querySelectorAll('a')) expect(anchor.textContent).toBe('Build firmware')
    expect(MOBILE_WORKSPACE).toContain('(hover: none) and (pointer: coarse)')
  })
})
