import type { FirmwareInspection } from './base'
import type { UsbAudioConfiguration } from '../config/usb-audio'
import type { SelectionConflict } from '../catalog/selection-conflicts'
import type { BaseLayout } from './elekloader/base-variants'
/** The docking startup, or the classic one: the stock renderer with Modwerk's two graphic tables. */
export type StartupAnimation = 'docking' | 'classic'
export type BuildReport = {
  version: string; revision: string; sourceCommit: string | null; sourceTreeSha256: string; moduleIds: string[]; moduleVersions: Record<string,string>; keepStockFx2: boolean
  osBytes: number; runtimeBytes: number; reservedBytes: number; fx1Rows: number; fx2Rows: number
  // Stock FX2 effects left out of this build's FX2 menu; FX1 keeps every stock effect.
  omittedStockFx2: string[]
  startupAnimation?: StartupAnimation
  // Docking was asked for, but this selection composes only with the classic startup.
  startupFallback?: true
}
export type BuildProgress = 'composing' | 'packing' | 'verifying'
export type EngineRequest =
  | { id: number; type: 'inspect'; buffer: ArrayBuffer; name: string }
  | { id: number; type: 'validate' | 'build'; moduleIds: string[]; keepStockFx2: boolean; usbAudio?: UsbAudioConfiguration; betaAccess?: boolean; startup?: StartupAnimation }
  | { id: number; type: 'clear' }
  | { id: number; type: 'base'; layout?: BaseLayout }
export type EngineResponse =
  | { id: number; type: 'inspection'; inspection: FirmwareInspection }
  | { id: number; type: 'validated'; report: BuildReport }
  | { id: number; type: 'progress'; phase: BuildProgress }
  | { id: number; type: 'built'; buffer: ArrayBuffer; report: BuildReport; sha256: string }
  | { id: number; type: 'cleared' }
  | { id: number; type: 'base'; buffer: ArrayBuffer; sha256: string; base: string }
  | { id: number; type: 'error'; message: string; conflict?: SelectionConflict }
// The owner authorized the logger-enabled release on 3 October 2026.
// The logger exception and remaining measurement limits are in docs/VERIFICATION.md.
export const ENGINE_AVAILABLE = true
// Explicit owner exception for this core logger addition; keep firmware local
// and preserve compatibility, stock guards and packaging rejection checks.
export const DOWNLOADS_ENABLED = true
// The dynamic DSP loader (stock effects and modules uploaded on demand) has not been proven on hardware.
// Off: stock DSP code stays built in and modules use the space of stock effects left off both menus.
export const DSP_LOADER = false
// Loading modules over USB is a beta: outside dev builds, only beta testers and verified administrators get the
// USB link and base install (hasUsbLinkAccess). True releases it to everyone, together with the server's prompt check.
export const USB_LINK = import.meta.env?.DEV ?? false // plain Node (scripts/module-verify.mjs) has no import.meta.env
// The ELEK update name appears on the resident bootloader's screen.
// The panel boot font has uppercase letters; lowercase codes draw symbols.
// Its fixed field is ten ASCII bytes; module versions are reported separately.
export const FIRMWARE_VERSION = 'ELEKLOADER'
