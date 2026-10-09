import type { UsbAudioConfiguration } from '../config/usb-audio'
import { BASE_FIRMWARE, type FirmwareInspection } from './base'
import type { BuildProgress, EngineRequest, EngineResponse } from './protocol'
import type { SelectionConflict } from '../catalog/selection-conflicts'
export class FirmwareBuildError extends Error {
  readonly conflict?: SelectionConflict
  constructor(message: string, conflict?: SelectionConflict) { super(message); this.name = 'FirmwareBuildError'; this.conflict = conflict }
}
export function createFirmwareClient() {
  let nextId = 0, generation = 0, disposed = false
  let rememberedFile: File | null = null, recovering: Promise<void> = Promise.resolve()
  const pending = new Map<number, {
    resolve: (response: EngineResponse) => void; reject: (error: Error) => void
    progress?: (phase: BuildProgress) => void
  }>()
  function rejectPending(message: string) { for (const task of pending.values()) task.reject(new Error(message)); pending.clear() }
  function createWorker() {
    const worker = new Worker(new URL('./firmware.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const response = event.data, task = pending.get(response.id)
      if (!task) return
      if (response.type === 'progress') { task.progress?.(response.phase); return }
      pending.delete(response.id)
      if (response.type === 'error') task.reject(new FirmwareBuildError(response.message, response.conflict)); else task.resolve(response)
    }
    worker.onerror = () => rejectPending('The local firmware worker stopped. Choose your file again or reload the page.')
    return worker
  }
  let worker = createWorker()
  function restart(message: string) {
    ++generation; worker.terminate(); rejectPending(message)
    if (!disposed) worker = createWorker()
  }
  function send(request: EngineRequest, transfer: Transferable[] = [], progress?: (phase: BuildProgress) => void): Promise<EngineResponse> {
    if (disposed) return Promise.reject(new Error('The local firmware worker was closed.'))
    return new Promise((resolve, reject) => {
      pending.set(request.id, { resolve, reject, progress })
      try { worker.postMessage(request, transfer) } catch (error) { pending.delete(request.id); reject(error) }
    })
  }
  async function inspect(file: File): Promise<FirmwareInspection> {
    const current = ++generation; rememberedFile = null
    if (file.size !== BASE_FIRMWARE.bytes) throw new Error('Choose the original ' + BASE_FIRMWARE.filename + '. This file has a different size.')
    const buffer = await file.arrayBuffer()
    if (current !== generation) throw new Error('The selected file changed.')
    const response = await send({ id: ++nextId, type: 'inspect', buffer, name: file.name }, [buffer])
    if (current !== generation) throw new Error('The selected file changed.')
    if (response.type !== 'inspection') throw new Error('The local firmware worker returned an unexpected result.')
    rememberedFile = file
    return response.inspection
  }
  return {
    inspect,
    async validate(moduleIds: string[], keepStockFx2: boolean, usbAudio?: UsbAudioConfiguration, betaAccess = false) {
      await recovering
      const response = await send({ id: ++nextId, type: 'validate', moduleIds, keepStockFx2, usbAudio, ...(betaAccess ? { betaAccess: true } : {}) })
      if (response.type !== 'validated') throw new Error('The local firmware worker returned an unexpected result.')
      return response.report
    },
    async build(moduleIds: string[], keepStockFx2: boolean, progress: (phase: BuildProgress) => void, usbAudio?: UsbAudioConfiguration, betaAccess = false) {
      await recovering
      const response = await send({ id: ++nextId, type: 'build', moduleIds, keepStockFx2, usbAudio, ...(betaAccess ? { betaAccess: true } : {}) }, [], progress)
      if (response.type !== 'built') throw new Error('The local firmware worker returned an unexpected result.')
      return response
    },
    cancelBuild() {
      const file = rememberedFile; restart('The firmware build was cancelled.')
      recovering = file ? inspect(file).then(() => {}) : Promise.resolve()
      // Recovery can finish after a clear or unmount; subsequent requests still
      // receive its failure, while this observer prevents an unhandled rejection.
      void recovering.catch(() => {})
    },
    async clear() { rememberedFile = null; restart('The selected firmware changed.'); recovering = Promise.resolve() },
    dispose() { disposed = true; rememberedFile = null; ++generation; worker.terminate(); rejectPending('The local firmware worker was closed.') },
  }
}
export type FirmwareClient = ReturnType<typeof createFirmwareClient>
