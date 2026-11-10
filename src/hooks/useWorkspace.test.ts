// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newConfiguration } from '../config/workspace'
import { deviceStore, openDeviceDatabase } from '../storage/device'
import { useWorkspace } from './useWorkspace'

// The saved firmware record cannot be read, as when the browser refuses that one store.
vi.mock('../storage/device', async original => {
  const actual = await original<typeof import('../storage/device')>()
  return { ...actual, deviceStore: (db: IDBDatabase) => ({ ...actual.deviceStore(db), readFirmware: () => Promise.reject(new Error('The firmware record could not be read.')) }) }
})

let root: Root, container: HTMLDivElement, workspace: ReturnType<typeof useWorkspace>
function Probe({ onRender }: { onRender: (value: ReturnType<typeof useWorkspace>) => void }) { const value = useWorkspace(); useEffect(() => onRender(value)); return null }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

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
})
