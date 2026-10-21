import { createDigiFirmwareClient, type DigiFirmwareClient } from '../engine/elektron/firmware-client'
import { createFirmwareClient, type FirmwareClient } from '../engine/client'
import { observeSiteDiagnosticOperation } from '../community/site-diagnostic-events'
import type { DiagnosticBuildKind, DiagnosticBuildPhase, DiagnosticBuildError } from '../community/octatrack-diagnostics-contract'
/**
 * The firmware worker is a 1.6 MB chunk that only the configuration pages need. This wrapper
 * has the engine client's interface but creates it, and with it the worker, on the first
 * request, so forum and library visits never download or start it.
 */
export function createLazyFirmwareClient(create: () => FirmwareClient = createFirmwareClient): FirmwareClient {
  let client: FirmwareClient | null = null, disposed = false, cancellation = 0
  const engine = () => {
    if (disposed) throw new Error('The local firmware worker was closed.')
    return client ??= create()
  }
  const observe = <T>(operation: () => Promise<T>, buildKind: DiagnosticBuildKind, phase: () => DiagnosticBuildPhase, error: DiagnosticBuildError) => {
    const started = cancellation
    return observeSiteDiagnosticOperation(operation, () => ({ event: 'build_failed', buildKind, phase: phase(), error }), () => !disposed && cancellation === started)
  }
  return {
    inspect: file => observe(() => engine().inspect(file), 'octatrack-firmware', () => 'preparing', 'input'),
    validate: (...args) => observe(() => engine().validate(...args), 'octatrack-firmware', () => 'preparing', 'selection'),
    build: (ids, keepStock, progress, usbAudio, betaAccess, startup) => {
      let phase: DiagnosticBuildPhase = 'building'
      return observe(() => engine().build(ids, keepStock, next => { phase = next; progress(next) }, usbAudio, betaAccess, startup), 'octatrack-firmware', () => phase, 'build')
    },
    buildBase: layout => observe(() => engine().buildBase(layout), 'octatrack-base', () => 'building', 'build'),
    cancelBuild: () => { ++cancellation; client?.cancelBuild() },
    clear: () => { ++cancellation; return client?.clear() ?? Promise.resolve() },
    dispose: () => { disposed = true; ++cancellation; client?.dispose(); client = null },
  }
}

/** Observe the existing eager Digi reader without changing inspection or disposal behavior. */
export function createObservedDigiFirmwareClient(create: () => DigiFirmwareClient = createDigiFirmwareClient): DigiFirmwareClient {
  const client = create()
  let disposed = false
  return {
    inspect: (machine, file) => observeSiteDiagnosticOperation(() => client.inspect(machine, file), () => ({ event: 'build_failed', buildKind: 'elekloader', phase: 'preparing', error: 'input' }), () => !disposed),
    dispose: () => { disposed = true; client.dispose() },
  }
}
