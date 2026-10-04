import type { Configuration } from '../config/workspace'
import { validateConfiguration } from '../config/workspace'
import { compareModuleVersions } from '../catalog/versions'
import type { ModuleVersion } from '../catalog/module-updates'

export type StoredFirmware = { name: string; blob: Blob }
const DATABASE = 'octamod-device'
export async function openDeviceDatabase(name = DATABASE): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('configurations', { keyPath: 'id' })
      request.result.createObjectStore('settings')
      request.result.createObjectStore('firmware')
    }
    request.onerror = () => reject(request.error ?? new Error('Browser storage is unavailable.'))
    request.onblocked = () => reject(new Error('Close other Octamod tabs and reload to open browser storage.'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}
export function deviceStore(db: IDBDatabase) {
  function transaction<T>(store: string, mode: IDBTransactionMode, operation: (table: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = operation(tx.objectStore(store))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Could not save on this device.'))
    })
  }
  return {
    async listConfigurations() {
      const items = await transaction('configurations', 'readonly', store => store.getAll())
      return items.map(validateConfiguration).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async saveConfiguration(item: Configuration) {
      await transaction('configurations', 'readwrite', store => store.put(validateConfiguration(item)))
    },
    async deleteConfiguration(id: string) { await transaction('configurations', 'readwrite', store => store.delete(id)) },
    async activeConfiguration(): Promise<string | undefined> { return transaction('settings', 'readonly', store => store.get('active')) },
    async setActiveConfiguration(id: string) { await transaction('settings', 'readwrite', store => store.put(id, 'active')) },
    async readModuleBaseline(): Promise<string[] | undefined> {
      const ids: unknown = await transaction('settings', 'readonly', store => store.get('module-library-baseline'))
      return Array.isArray(ids) && ids.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id)) ? [...new Set(ids)] : undefined
    },
    async rememberModuleBaseline(ids: readonly string[]) {
      if (!ids.every(id => /^[a-z][a-z0-9-]*$/.test(id))) throw new Error('Invalid module library baseline.')
      await transaction('settings', 'readwrite', store => store.put([...new Set(ids)], 'module-library-baseline'))
    },
    async readModuleViews(): Promise<Record<string, string>> {
      const records: unknown[] = await transaction('settings', 'readonly', store => store.getAll(IDBKeyRange.bound('module-view/', 'module-view/\uffff')))
      const versions: Record<string, string> = {}
      for (const record of records) {
        if (!record || typeof record !== 'object') continue
        const { id, version } = record as Partial<ModuleVersion>
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id) || typeof version !== 'string') continue
        try { compareModuleVersions(version, version); versions[id] = version } catch { /* Ignore corrupt viewing history. */ }
      }
      return versions
    },
    async rememberModuleView(module: ModuleVersion) {
      if (!/^[a-z][a-z0-9-]*$/.test(module.id)) throw new Error('Invalid viewed module.')
      compareModuleVersions(module.version, module.version)
      await transaction('settings', 'readwrite', store => store.put({ id: module.id, version: module.version }, 'module-view/' + module.id))
    },
    async readFirmware(machine: 'octatrack' | 'digitakt' | 'digitone' | 'digitakt-ii' = 'octatrack'): Promise<StoredFirmware | undefined> { return transaction('firmware', 'readonly', store => store.get(machine === 'octatrack' ? 'base' : 'base/' + machine)) },
    async saveFirmware(file: File, machine: 'octatrack' | 'digitakt' | 'digitone' | 'digitakt-ii' = 'octatrack') {
      await transaction('firmware', 'readwrite', store => store.put({ name: file.name, blob: file }, machine === 'octatrack' ? 'base' : 'base/' + machine))
    },
    async forgetFirmware(machine: 'octatrack' | 'digitakt' | 'digitone' | 'digitakt-ii' = 'octatrack') { await transaction('firmware', 'readwrite', store => store.delete(machine === 'octatrack' ? 'base' : 'base/' + machine)) },
  }
}
export type DeviceStore = ReturnType<typeof deviceStore>
