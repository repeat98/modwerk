import { hasBetaAccess } from '../community/beta-access'
import { useCommunity } from '../community/context'
import { requireBuildAccount } from '../community/member-access'
import { trackUsage } from '../community/usage'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Configuration } from '../config/workspace'
import { moduleAvailabilityError } from '../catalog/availability'
import { selectionConflictError } from '../catalog/selection-conflicts'
import { usbAudioBuildError } from '../config/usb-audio'
import { moduleBuildError } from '../catalog/build-support'
import type { FirmwareInspection } from '../engine/base'
import type { FirmwareClient } from '../engine/client'
import { FirmwareBuildError } from '../engine/client'
import type { SelectionConflict } from '../catalog/selection-conflicts'
import { DSP_LOADER } from '../engine/protocol'
import type { BuildProgress, BuildReport } from '../engine/protocol'
export type BuildView = { key: string; state: 'empty' | 'validating' | 'valid' | 'building' | 'built' | 'error'; error?: string; conflict?: SelectionConflict; report?: BuildReport; phase?: BuildProgress; result?: { buffer: ArrayBuffer; sha256: string } }
function failedBuild(key: string, error: unknown): BuildView {
  return { key, state: 'error', error: error instanceof Error ? error.message : 'Could not prepare this firmware.', ...(error instanceof FirmwareBuildError && error.conflict ? { conflict: error.conflict } : {}) }
}
export function useFirmwareBuild(client: RefObject<FirmwareClient | null>, active: Configuration | undefined, firmware: FirmwareInspection | null) {
  const {session}=useCommunity(),memberId=session.user?.verified&&session.user.username?session.user.id:null
  const betaAccess = hasBetaAccess(session)
  const ids = active?.moduleIds ?? [], keepStock = DSP_LOADER && (active?.keepStockFx2 ?? true)
  const configurationError=moduleAvailabilityError(ids,betaAccess)||selectionConflictError(ids,keepStock)||moduleBuildError(ids)||usbAudioBuildError(active?.usbAudio)
  const key = JSON.stringify([active?.id, ids, active?.moduleVersions, active?.usbAudio, keepStock, firmware?.sha256, memberId, betaAccess])
  const [view, setView] = useState<BuildView>({ key: '', state: 'empty' })
  const operation = useRef(0), building = useRef(false)
  useEffect(() => {
    const controller=operation, engine=client.current
    const current = ++controller.current
    if(!memberId)return
    if (!firmware || !ids.length || configurationError) return
    void engine?.validate(ids, keepStock, active?.usbAudio, betaAccess).then(report => {
      if (operation.current === current) setView({ key, state: 'valid', report })
    }).catch(error => { if (operation.current === current) setView(failedBuild(key, error)) })
    return () => { ++controller.current; if (building.current) { building.current = false; engine?.cancelBuild() } }
  // The key captures every firmware/configuration input, including chooser options.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, memberId])
  const current: BuildView = configurationError ? {key,state:'error',error:configurationError} : view.key === key ? view : { key, state: firmware && ids.length ? 'validating' : 'empty' }
  async function build() {
    if (!memberId || !firmware || !ids.length || !client.current || current.state !== 'valid') return
    const request = ++operation.current
    building.current = true; setView({ key, state: 'building', report: current.report, phase: 'composing' })
    let started = false
    try {
      await requireBuildAccount(ids)
      if(operation.current!==request)return
      started = true
      const result = await client.current.build(ids, keepStock, phase => { if (operation.current === request) setView({ key, state: 'building', report: current.report, phase }) }, active?.usbAudio, betaAccess)
      if (operation.current === request) { setView({ key, state: 'built', report: result.report, result: { buffer: result.buffer, sha256: result.sha256 } }); trackUsage('build_succeeded', 'octatrack') }
    } catch (error) {
      if (operation.current !== request) return
      setView(failedBuild(key, error))
      // A refused sign-in is not a failed build, and a cancelled build never reaches this point.
      if (started) trackUsage('build_failed', 'octatrack')
    }
    finally { if (operation.current === request) building.current = false }
  }
  function cancel() {
    ++operation.current; building.current = false; client.current?.cancelBuild()
    setView({ key, state: 'valid', report: current.report })
  }
  function retry() {
    if(configurationError)return
    const request = ++operation.current
    setView({ key, state: 'validating' })
    void client.current?.validate(ids, keepStock, active?.usbAudio, betaAccess).then(report => { if (operation.current === request) setView({ key, state: 'valid', report }) }).catch(error => { if (operation.current === request) setView(failedBuild(key, error)) })
  }
  return { ...current, build, cancel, retry, canRetry: !configurationError && !!firmware && !!ids.length }
}
