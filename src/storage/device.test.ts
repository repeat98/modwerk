import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deviceStore, openDeviceDatabase } from './device'
import { newConfiguration, validateConfiguration, pinModuleVersions } from '../config/workspace'
import { moduleHasUpdate, moduleIsNew, moduleViewsToRemember } from '../catalog/module-updates'

describe('device persistence', () => {
  it('restores the reported five-module configuration with current versions across sessions', async () => {
    const name = 'test-' + crypto.randomUUID(), db = await openDeviceDatabase(name)
    const ids = ['miniverb', 'tapeecho', 'euclid', 'usb-audio-out-tracks-main-cue', 'quantizer']
    const config = { ...newConfiguration('Reported configuration', ids, false), moduleVersions: Object.fromEntries(ids.map(id => [id, '0.1.1-experimental'])) }
    // Seed the pre-update record directly, as it was saved by an earlier site release.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['configurations', 'settings'], 'readwrite')
      tx.objectStore('configurations').put(config)
      tx.objectStore('settings').put(config.id, 'active')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    const restoredDb = await openDeviceDatabase(name), restored = deviceStore(restoredDb)
    expect(await restored.listConfigurations()).toEqual([{ ...config, moduleVersions: pinModuleVersions(ids) }])
    expect(await restored.activeConfiguration()).toBe(config.id)
    expect(await restored.readFirmware()).toBeUndefined()
    restoredDb.close()
  })
  it('remembers module views across sessions without changing saved configurations', async () => {
    const name = 'test-' + crypto.randomUUID()
    const db = await openDeviceDatabase(name), store = deviceStore(db)
    const config = newConfiguration('Earlier release', ['midi-scenes'], false, { 'midi-scenes': '0.1.1-experimental' })
    await store.saveConfiguration(config)
    await store.setActiveConfiguration(config.id)
    await Promise.all([
      store.rememberModuleView({ id: 'midi-scenes', version: '0.1.1-experimental' }),
      store.rememberModuleView({ id: 'repitch', version: '0.1.1-experimental' }),
    ])
    db.close()
    const restoredDb = await openDeviceDatabase(name), restored = deviceStore(restoredDb)
    const current = { id: 'midi-scenes', version: '0.2.0-experimental' }
    expect(await restored.readModuleViews()).toEqual({ 'midi-scenes': '0.1.1-experimental', repitch: '0.1.1-experimental' })
    expect(moduleHasUpdate(current, (await restored.readModuleViews())[current.id])).toBe(true)
    await restored.rememberModuleView(current)
    expect(moduleHasUpdate(current, (await restored.readModuleViews())[current.id])).toBe(false)
    expect((await restored.listConfigurations())[0].moduleVersions).toEqual(config.moduleVersions)
    expect(await restored.activeConfiguration()).toBe(config.id)
    expect(await restored.readFirmware()).toBeUndefined()
    restoredDb.close()
  })

  it('ignores corrupt viewing history and rejects invalid versions without breaking the workspace', async () => {
    const db = await openDeviceDatabase('test-' + crypto.randomUUID()), store = deviceStore(db)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      tx.objectStore('settings').put({ id: 'midi-scenes', version: 'latest' }, 'module-view/midi-scenes')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    expect(await store.readModuleViews()).toEqual({})
    await expect(store.rememberModuleView({ id: 'midi-scenes', version: 'latest' })).rejects.toThrow('semantic version')
    db.close()
  })
  it('keeps independently edited configurations and the active selection across connections', async () => {
    const name = 'test-' + crypto.randomUUID()
    const db = await openDeviceDatabase(name)
    const store = deviceStore(db)
    const a = newConfiguration('Live set', ['tapeecho'])
    const b = {...newConfiguration('Ambient', ['miniverb', 'repitch']),createdAt:new Date(Date.parse(a.createdAt)+1).toISOString()}
    await store.saveConfiguration(a); await store.saveConfiguration(b)
    await store.saveConfiguration({ ...a, name: 'Live set II', moduleIds: ['euclid'],moduleVersions:{euclid:'0.1.0-experimental'} })
    await store.setActiveConfiguration(b.id)
    db.close()
    const restoredDb = await openDeviceDatabase(name)
    const restored = deviceStore(restoredDb)
    expect((await restored.listConfigurations()).map(item => [item.name, item.moduleIds])).toEqual([['Live set II', ['euclid']], ['Ambient', ['miniverb', 'repitch']]])
    expect(await restored.activeConfiguration()).toBe(b.id)
    await restored.deleteConfiguration(a.id)
    expect((await restored.listConfigurations()).map(item => item.id)).toEqual([b.id])
    restoredDb.close()
  })
  it('stores a binary locally and removes it permanently without touching configurations', async () => {
    const db = await openDeviceDatabase('test-' + crypto.randomUUID())
    const store = deviceStore(db)
    const config = newConfiguration('Test')
    await store.saveConfiguration(config)
    // Synthetic bytes only: no real firmware in tests.
    await store.saveFirmware(new File([new Uint8Array([1, 2, 3])], 'synthetic.bin'))
    expect(Array.from(new Uint8Array(await (await store.readFirmware())!.blob.arrayBuffer()))).toEqual([1, 2, 3])
    await store.forgetFirmware()
    expect(await store.readFirmware()).toBeUndefined()
    expect(await store.listConfigurations()).toHaveLength(1)
    db.close()
  })
  it('refuses blank names and unknown module identities before saving', async () => {
    expect(() => newConfiguration('   ')).toThrow()
    expect(() => newConfiguration('Unknown', ['not-a-module'])).toThrow()
  })
})

it('migrates old device configurations without changing selection and preserves explicit compact menus',async()=>{
 const created=newConfiguration('Legacy',['euclid']),{keepStockFx2,...legacy}=created
 expect(keepStockFx2).toBe(false);expect(validateConfiguration(legacy).keepStockFx2).toBe(true)
 const db=await openDeviceDatabase('test-'+crypto.randomUUID()),store=deviceStore(db)
 await store.saveConfiguration({...created,keepStockFx2:false})
 expect((await store.listConfigurations())[0].keepStockFx2).toBe(false);db.close()
})


it('persists the initial full catalog across sessions and remembers opening a new module', async () => {
 const name = 'test-' + crypto.randomUUID(), existing = { id: 'repitch', version: '0.1.1-experimental' }, addition = { id: 'midi-scenes', version: '0.2.0-experimental' }
 const db = await openDeviceDatabase(name), store = deviceStore(db)
 expect(await store.readModuleBaseline()).toBeUndefined()
 // Legacy viewing history remains usable when establishing the new full-catalog baseline.
 await store.rememberModuleView(existing)
 await store.rememberModuleBaseline([existing.id, 'miniverb'])
 db.close()
 const restoredDb = await openDeviceDatabase(name), restored = deviceStore(restoredDb)
 const baseline = (await restored.readModuleBaseline())!, viewed = await restored.readModuleViews()
 expect(baseline).toEqual([existing.id, 'miniverb'])
 expect(moduleIsNew({ id: 'miniverb', version: '0.1.2-experimental' }, undefined, baseline)).toBe(false)
 expect(moduleIsNew(addition, viewed[addition.id], baseline)).toBe(true)
 expect(moduleViewsToRemember([addition], viewed, baseline)).toEqual([])
 await restored.rememberModuleView(addition)
 restoredDb.close()
 const reopenedDb = await openDeviceDatabase(name), reopened = deviceStore(reopenedDb)
 expect(moduleIsNew(addition, (await reopened.readModuleViews())[addition.id], (await reopened.readModuleBaseline())!)).toBe(false)
 expect(await reopened.listConfigurations()).toEqual([])
 expect(await reopened.readFirmware()).toBeUndefined()
 reopenedDb.close()
})

it('ignores corrupt catalog baselines so the workspace can establish a fresh baseline', async () => {
 const db = await openDeviceDatabase('test-' + crypto.randomUUID()), store = deviceStore(db)
 await new Promise<void>((resolve, reject) => {
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').put(['repitch', 42], 'module-library-baseline')
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
 })
 expect(await store.readModuleBaseline()).toBeUndefined()
 await expect(store.rememberModuleBaseline(['invalid id'])).rejects.toThrow('baseline')
 db.close()
})

it('keeps each machine firmware separate across sessions and retains the legacy Octatrack slot', async () => {
 const name = 'test-' + crypto.randomUUID(), db = await openDeviceDatabase(name), store = deviceStore(db)
 const config = newConfiguration('Preserved configuration')
 await store.saveConfiguration(config)
 await store.setActiveConfiguration(config.id)
 await store.saveFirmware(new File([new Uint8Array([1])], 'ot-test.bin'))
 await store.saveFirmware(new File([new Uint8Array([2])], 'dt-test.syx'), 'digitakt')
 await store.saveFirmware(new File([new Uint8Array([3])], 'dn-test.syx'), 'digitone')
 await store.saveFirmware(new File([new Uint8Array([4])], 'dt2-test.syx'), 'digitakt-ii')
 db.close()
 const reopened = await openDeviceDatabase(name), restored = deviceStore(reopened)
 expect((await restored.readFirmware())?.name).toBe('ot-test.bin')
 expect((await restored.readFirmware('octatrack'))?.name).toBe('ot-test.bin')
 expect((await restored.readFirmware('digitakt'))?.name).toBe('dt-test.syx')
 expect((await restored.readFirmware('digitone'))?.name).toBe('dn-test.syx')
 expect((await restored.readFirmware('digitakt-ii'))?.name).toBe('dt2-test.syx')
 await restored.forgetFirmware('digitakt-ii')
 expect(await restored.readFirmware('digitakt-ii')).toBeUndefined()
 expect((await restored.readFirmware('digitakt'))?.name).toBe('dt-test.syx')
 await restored.forgetFirmware('digitakt')
 expect(await restored.readFirmware('digitakt')).toBeUndefined()
 expect((await restored.readFirmware('digitone'))?.name).toBe('dn-test.syx')
 expect((await restored.readFirmware())?.name).toBe('ot-test.bin')
 expect(await restored.activeConfiguration()).toBe(config.id)
 expect(await restored.listConfigurations()).toEqual([config])
 reopened.close()
})
