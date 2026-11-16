import type { FirmwareInspection } from './base'
import type { BaseLayout } from './elekloader/base-variants'
export type BuildProgress = 'composing' | 'packing' | 'verifying'
export type EngineRequest =
  | { id: number; type: 'inspect'; buffer: ArrayBuffer; name: string }
  | { id: number; type: 'clear' }
  | { id: number; type: 'base'; layout?: BaseLayout; step?: boolean }
export type EngineResponse =
  | { id: number; type: 'inspection'; inspection: FirmwareInspection }
  | { id: number; type: 'cleared' }
  | { id: number; type: 'base'; buffer: ArrayBuffer; sha256: string; base: string }
  | { id: number; type: 'error'; message: string }
// The dynamic DSP loader (stock effects and modules uploaded on demand) has not been proven on hardware.
// Off: stock DSP code stays built in and modules use the space of stock effects left off both menus.
export const DSP_LOADER = false
// Dev builds show every beta interface, the USB link and base install included (hasBetaUi, hasOctatrackBase). Releasing
// the Octatrack base path to everyone is OCTATRACK_BASE_RELEASED (src/config/octatrack-base.ts), not this.
export const USB_LINK = import.meta.env?.DEV ?? false // plain Node (the scripts) has no import.meta.env
// The ELEK update name appears on the resident bootloader's screen.
// The panel boot font has uppercase letters; lowercase codes draw symbols.
// Its fixed field is ten ASCII bytes; module versions are reported separately.
export const FIRMWARE_VERSION = 'ELEKLOADER'
