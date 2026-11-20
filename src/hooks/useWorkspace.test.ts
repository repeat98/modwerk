// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newConfiguration } from '../config/workspace'
import { deviceStore, openDeviceDatabase } from '../storage/device'
import { useWorkspace } from './useWorkspace'
import { AVAILABLE_MODULES, PAUSED_MODULE_IDS, isBetaModule, isModulePaused } from '../catalog/availability'
import { SET_MODULE_LIMIT } from '../catalog/set-limit'
import { USB_AUDIO_MODULE } from '../config/usb-audio'

// The saved firmware record cannot be read, as when the browser refuses that one store. The tests also see every
// connection the workspace opens, and can make the next read of the saved sets abort the way Safari does.
const storage = vi.hoisted(() => ({ connections: [] as IDBDatabase[], failReads: 0 }))
vi.mock('../storage/device', async original => {
  const actual = await original<typeof import('../storage/device')>()
  return { ...actual, deviceStore: (db: IDBDatabase) => {
    storage.connections.push(db)
    const store = actual.deviceStore(db)
    return { ...store, readFirmware: () => Promise.reject(new Error('The firmware record could not be read.')),
      listConfigurations: (unreadable?: (error: unknown, record: unknown) => void) => storage.failReads-- > 0 ? Promise.reject(new Error('The browser stopped reading its storage without giving a reason.')) : store.listConfigurations(unreadable) }
  } }
})

let root: Root, container: HTMLDivElement, workspace: ReturnType<typeof useWorkspace>
function Probe({ onRender }: { onRender: (value: ReturnType<typeof useWorkspace>) => void }) { const value = useWorkspace(); useEffect(() => onRender(value)); return null }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); storage.connections = []; storage.failReads = 0; await clearSets() })
async function clearSets() { const db = await openDeviceDatabase(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(['configurations', 'settings'], 'readwrite'); tx.objectStore('configurations').clear(); tx.objectStore('settings').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() }

describe('opening the workspace', () => {
  it('keeps the saved sets when the saved firmware cannot be read, and saves edits to them', async () => {
    const live = { ...newConfiguration('Live'), createdAt: '2026-11-01T10:00:00.000Z' }, studio = { ...newConfiguration('Studio'), createdAt: '2026-11-02T10:00:00.000Z' }
    const database = await openDeviceDatabase(), store = deviceStore(database)
    await store.saveConfiguration(live); await store.saveConfiguration(studio); await store.setActiveConfiguration(studio.id); database.close()
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    expect(workspace.configurations.map(item => item.name)).toEqual(['Live', 'Studio'])
    expect(workspace.active?.id).toBe(studio.id)
    expect(workspace.storageError).toBe('')
    await act(() => workspace.renameConfiguration('Studio B'))
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
    const reopened = await openDeviceDatabase()
    expect((await deviceStore(reopened).listConfigurations()).map(item => item.name)).toEqual(['Live', 'Studio B'])
    reopened.close()
  })
  it('deletes the active set without overwriting the next set edited in another tab', async () => {
    const db = await openDeviceDatabase(), otherTab = deviceStore(db)
    const live = newConfiguration('Live'), studio = newConfiguration('Studio')
    await otherTab.saveConfiguration(live, { makeActive: true })
    await otherTab.saveConfiguration(studio)
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    const edited = { ...studio, name: 'Studio B' }
    await otherTab.saveConfiguration(edited)
    await act(() => workspace.deleteConfiguration())
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
    expect(await otherTab.listConfigurations()).toEqual([edited])
    expect(await otherTab.activeConfiguration()).toBe(studio.id)
    db.close()
  })
})

describe('when Safari drops device storage', () => {
  async function seed(...names: string[]) {
    const database = await openDeviceDatabase(), store = deviceStore(database)
    const items = names.map((name, index) => ({ ...newConfiguration(name), createdAt: '2026-11-0' + (index + 1) + 'T10:00:00.000Z' }))
    for (const item of items) await store.saveConfiguration(item)
    database.close(); storage.connections = []
    return items
  }
  it('opens the saved sets on a second attempt when the first read is aborted', async () => {
    await seed('Live')
    storage.failReads = 1
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    expect(workspace.configurations.map(item => item.name)).toEqual(['Live'])
    expect(workspace.storageError).toBe('')
  })
  it('says why when both attempts fail, and never writes its placeholder set over the saved ones', async () => {
    await seed('Live')
    storage.failReads = 2
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    expect(workspace.storageError).toBe('Your saved sets could not be loaded from this device, so changes are not saved. Reload the page to try again. The browser stopped reading its storage without giving a reason.')
    await act(() => workspace.renameConfiguration('Placeholder'))
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
    const reopened = await openDeviceDatabase()
    expect((await deviceStore(reopened).listConfigurations()).map(item => item.name)).toEqual(['Live'])
    reopened.close()
  })
  it('reconnects and saves when the connection is lost after the sets opened', async () => {
    await seed('Live')
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    storage.connections[0].close()
    await act(() => workspace.renameConfiguration('Live B'))
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
    expect(workspace.storageError).toBe('')
    expect(storage.connections).toHaveLength(2)
    const reopened = await openDeviceDatabase()
    expect((await deviceStore(reopened).listConfigurations()).map(item => item.name)).toEqual(['Live B'])
    reopened.close()
  })
  it('names each saved set it cannot open and why, and keeps it', async () => {
    const [live] = await seed('Live')
    const database = await openDeviceDatabase()
    await new Promise<void>((resolve, reject) => { const tx = database.transaction('configurations', 'readwrite'); tx.objectStore('configurations').put({ ...newConfiguration('Old set'), moduleIds: ['no-such-module'] }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    database.close()
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    expect(workspace.configurations.map(item => item.id)).toEqual([live.id])
    expect(workspace.unreadable).toEqual([{ name: 'Old set', reason: 'Unknown module: no-such-module' }])
  })
})

describe('the module limit of an Octatrack set', () => {
  it('loads a longer set whole, refuses any further module, and takes one again once trimmed below the limit', async () => {
    const ids = AVAILABLE_MODULES.map(module => module.id).filter(id => id !== USB_AUDIO_MODULE), over = SET_MODULE_LIMIT + 3
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    // A shared or saved set past the limit still opens with every module in it.
    await act(() => { workspace.importConfiguration('Shared', ids.slice(0, over)) })
    expect(workspace.active?.moduleIds).toHaveLength(over)
    await act(() => workspace.toggleModule(ids[over]))
    expect(workspace.active?.moduleIds).toHaveLength(over)
    for (const id of ids.slice(SET_MODULE_LIMIT, over)) await act(() => workspace.toggleModule(id))
    expect(workspace.active?.moduleIds).toEqual(ids.slice(0, SET_MODULE_LIMIT))
    // Full: the 21st is refused, USB Audio's setup does not count.
    await act(() => workspace.toggleModule(ids[over]))
    expect(workspace.active?.moduleIds).toEqual(ids.slice(0, SET_MODULE_LIMIT))
    await act(() => workspace.configureUsbAudio(undefined))
    expect(workspace.active?.moduleIds).toEqual([...ids.slice(0, SET_MODULE_LIMIT), USB_AUDIO_MODULE])
    await act(() => workspace.toggleModule(ids[0]))
    await act(() => workspace.toggleModule(ids[over]))
    expect(workspace.active?.moduleIds).toEqual([...ids.slice(1, SET_MODULE_LIMIT), USB_AUDIO_MODULE, ids[over]])
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
  })
  it('fills a set from what’s on the Octatrack whole, as an import does, past the limit too', async () => {
    const ids = AVAILABLE_MODULES.map(module => module.id).filter(id => id !== USB_AUDIO_MODULE), over = SET_MODULE_LIMIT + 3
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    await act(() => { workspace.importConfiguration('Empty', []) })
    await act(() => workspace.addModules(ids.slice(0, over)))
    expect(workspace.active?.moduleIds).toEqual(ids.slice(0, over))
    expect(Object.keys(workspace.active!.moduleVersions).sort()).toEqual(ids.slice(0, over).sort())
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
  })
  it('leaves out of that fill what isn’t available here, as adding one by one does: a paused module', async () => {
    const paused = PAUSED_MODULE_IDS.find(id => !isBetaModule(id))!
    expect(isModulePaused(paused)).toBe(true); expect(isBetaModule('airwindows-chorus')).toBe(false)
    await act(async () => root.render(createElement(Probe, { onRender: value => { workspace = value } })))
    await vi.waitFor(() => expect(workspace.ready).toBe(true))
    await act(() => { workspace.importConfiguration('Empty', []) })
    await act(() => workspace.addModules(['everb', paused, 'airwindows-chorus', 'tapehead']))
    expect(workspace.active?.moduleIds).toEqual(['everb', 'airwindows-chorus', 'tapehead'])
    await act(() => workspace.toggleModule(paused))
    expect(workspace.active?.moduleIds).toEqual(['everb', 'airwindows-chorus', 'tapehead'])
    await vi.waitFor(() => expect(workspace.saving).toBe(false))
  })
})
