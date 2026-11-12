import { BASE_FIRMWARE, type FirmwareInspection } from './base'
import type { EngineRequest, EngineResponse } from './protocol'
import type { BaseLayout } from './elekloader/base-variants'
export function createFirmwareClient() {
  let nextId = 0, generation = 0, disposed = false
  const pending = new Map<number, { resolve: (response: EngineResponse) => void; reject: (error: Error) => void }>()
  function rejectPending(message: string) { for (const task of pending.values()) task.reject(new Error(message)); pending.clear() }
  function createWorker() {
    const worker = new Worker(new URL('./firmware.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const response = event.data, task = pending.get(response.id)
      if (!task) return
      pending.delete(response.id)
      if (response.type === 'error') task.reject(new Error(response.message)); else task.resolve(response)
    }
    // A plain Event without a message means the worker script never loaded: usually a deploy replaced its hashed file after this page opened.
    worker.onerror = event => rejectPending(event.message ? 'The local firmware worker stopped. Choose your file again or reload the page.' : 'Modwerk was updated since you opened this page. Reload the page, then choose your file again.')
    return worker
  }
  let worker = createWorker()
  function restart(message: string) {
    ++generation; worker.terminate(); rejectPending(message)
    if (!disposed) worker = createWorker()
  }
  function send(request: EngineRequest, transfer: Transferable[] = []): Promise<EngineResponse> {
    if (disposed) return Promise.reject(new Error('The local firmware worker was closed.'))
    return new Promise((resolve, reject) => {
      pending.set(request.id, { resolve, reject })
      try { worker.postMessage(request, transfer) } catch (error) { pending.delete(request.id); reject(error) }
    })
  }
  async function inspect(file: File): Promise<FirmwareInspection> {
    const current = ++generation
    if (file.size !== BASE_FIRMWARE.bytes) throw new Error('Choose the original ' + BASE_FIRMWARE.filename + '. This file has a different size.')
    const buffer = await file.arrayBuffer()
    if (current !== generation) throw new Error('The selected file changed.')
    const response = await send({ id: ++nextId, type: 'inspect', buffer, name: file.name }, [buffer])
    if (current !== generation) throw new Error('The selected file changed.')
    if (response.type !== 'inspection') throw new Error('The local firmware worker returned an unexpected result.')
    return response.inspection
  }
  return {
    inspect,
    /** The Modwerk base's .bin, built from the verified OS file. */
    async buildBase(layout?: BaseLayout) {
      const response = await send({ id: ++nextId, type: 'base', ...(layout ? { layout } : {}) })
      if (response.type !== 'base') throw new Error('The local firmware worker returned an unexpected result.')
      return { buffer: response.buffer, sha256: response.sha256, base: response.base }
    },
    async clear() { restart('The selected firmware changed.') },
    dispose() { disposed = true; ++generation; worker.terminate(); rejectPending('The local firmware worker was closed.') },
  }
}
export type FirmwareClient = ReturnType<typeof createFirmwareClient>
