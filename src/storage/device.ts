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
  function transaction<T>(stores: string | string[], mode: IDBTransactionMode, operation: (table: IDBObjectStore, tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      let request: IDBRequest<T>
      try { request = operation(tx.objectStore(typeof stores === 'string' ? stores : stores[0]), tx) }
      catch (error) { tx.abort(); reject(error); return }
      tx.oncomplete = () => resolve(request.result)
      // Safari aborts transactions without any error, for example while it suspends a home-screen app.
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error(mode === 'readonly' ? 'The browser stopped reading its storage without giving a reason.' : 'The browser stopped this save without giving a reason.'))
    })
  }
  return {
    /** Readable configurations. A record this version cannot read, such as one naming a module the catalog dropped,
     * is skipped and reported, never deleted, so it comes back once the catalog can read it again. */
    async listConfigurations(unreadable?: (error: unknown, record: unknown) => void) {
      const items: unknown[] = await transaction('configurations', 'readonly', store => store.getAll())
      return items.flatMap(item => { try { return [validateConfiguration(item)] } catch (error) { unreadable?.(error, item); return [] } })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async saveConfiguration(item: Configuration, { makeActive = false } = {}) {
      const saved = validateConfiguration(item)
      await transaction(makeActive ? ['configurations', 'settings'] : 'configurations', 'readwrite', (store, tx) => {
        const request = store.put(saved)
        if (makeActive) tx.objectStore('settings').put(saved.id, 'active')
        return request
      })
    },
    async deleteConfiguration(id: string, next: string | Configuration) {
      const replacement = typeof next === 'string' ? undefined : validateConfiguration(next)
      const nextId = typeof next === 'string' ? next : next.id
      await transaction(['configurations', 'settings'], 'readwrite', (store, tx) => {
        if (replacement) store.put(replacement)
        tx.objectStore('settings').put(nextId, 'active')
        return store.delete(id)
      })
    },
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
    async readFirmware(machine: 'octatrack' | 'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii' | 'model-cycles' | 'zoom-ms-70cdr' = 'octatrack'): Promise<StoredFirmware | undefined> { return transaction('firmware', 'readonly', store => store.get(machine === 'octatrack' ? 'base' : 'base/' + machine)) },
    async saveFirmware(file: File, machine: 'octatrack' | 'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii' | 'model-cycles' | 'zoom-ms-70cdr' = 'octatrack') {
      await transaction('firmware', 'readwrite', store => store.put({ name: file.name, blob: file }, machine === 'octatrack' ? 'base' : 'base/' + machine))
    },
    async forgetFirmware(machine: 'octatrack' | 'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii' | 'model-cycles' | 'zoom-ms-70cdr' = 'octatrack') { await transaction('firmware', 'readwrite', store => store.delete(machine === 'octatrack' ? 'base' : 'base/' + machine)) },
  }
}
export type DeviceStore = ReturnType<typeof deviceStore>
