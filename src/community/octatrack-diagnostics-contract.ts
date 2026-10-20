// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

// Closed, versioned diagnostics: no arbitrary text, project data, USB serials, firmware or memory dumps.
export const OCTATRACK_DIAGNOSTICS_VERSION = '2026-10-15.1'
export const DIAGNOSTIC_RETENTION_DAYS = 30
export const DIAGNOSTIC_CONSENT_DAYS = 90
export const OCTATRACK_COUNTS = ['usb_sync_started', 'usb_sync_kept', 'usb_sync_undone', 'usb_sync_failed'] as const
export type OctatrackCount = typeof OCTATRACK_COUNTS[number]
export const DIAGNOSTIC_USB_EVENTS = ['connected', 'disconnected', 'sync_started', 'sync_failed', 'selftest', 'health', 'kept', 'undone', 'load', 'unresponsive', 'device_log'] as const
/** The part of the site a browser error happened on, from the page's route: a fixed name, never the address. */
export const DIAGNOSTIC_SITE_AREAS = ['library', 'configuration', 'octatrack', 'module', 'forum', 'account', 'admin', 'other'] as const
/** A browser error's type, by its standard name; anything else is OtherError. Never its message. */
export const DIAGNOSTIC_ERROR_KINDS = ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError', 'NetworkError', 'NotFoundError',
  'NotAllowedError', 'InvalidStateError', 'QuotaExceededError', 'SecurityError', 'DataError', 'OtherError'] as const
export type DiagnosticSiteArea = typeof DIAGNOSTIC_SITE_AREAS[number]
export type DiagnosticErrorKind = typeof DIAGNOSTIC_ERROR_KINDS[number]
/** `load` and `unresponsive`: the connected unit's meters over the last minutes, per mille, as [mean, peak]; a meter
 * the unit hadn't refreshed is left out. `unresponsive`: `usb` when reads failed, `ui` when its UI tick stood still. */
export interface DiagnosticLive { samples: number; cpu?: [number, number]; dsp1to4?: [number, number]; dsp5to8?: [number, number] }
export const DIAGNOSTIC_UNRESPONSIVE = ['usb', 'ui'] as const
/** `device_log`: records from the unit's own log (diag.h), uploaded at the next connection. */
export const DEVICE_INCIDENTS = ['start', 'hot', 'freeze', 'crash', 'stall', 'set', 'base'] as const
/** `frameGap`: the window's longest time between two audio frames, µs (log version 2); `tickGap` its longest run of
 * frames without a UI tick. */
export interface DeviceLoad { seq: number; boot: number; minute: number; cpu: [number, number]; dsp1to4: [number, number]; dsp5to8: [number, number]; samples: number; playing: number; frameGap?: number; tickGap?: number }
/** crash.c's record: the last error exception, with the eight longs at its PC read cached and uncached (log version 2). */
export interface DeviceCrash { count: number; vector: number; pc: number; sr: number; sp: number; d: number[]; a: number[]; stack: number[]; code: number[]; memory: number[] }
/** dsp.c's record of the last DSP stall: why (1 frames stopped, 2 eDMA refused, 0 a test), the tick, the loader's report words. */
export interface DeviceStall { count: number; reason: number; ticks: number; report: number[] }
export interface DeviceIncident {
  seq: number; boot: number; second: number; kind: typeof DEVICE_INCIDENTS[number]; a: number
  cpu: number; dsp1to4: number; dsp5to8: number
  /** Each track's machine type byte and signature (three bytes a track), the effect id each slot runs (FX1 T1-T8, then
   * FX2), the last 16 key codes (255: none), stock's screen code and the tempo times 24. */
  machines: number[]; fx: number[]; keys: number[]; screen: number; tempo24: number; playing: boolean
}
export const DEVICE_LOG_LOADS = 40, DEVICE_LOG_INCIDENTS = 10 /* a record's most, so one fits the 8 KiB request */
export const DIAGNOSTIC_USB_PHASES = ['unsupported', 'idle', 'connecting', 'stock', 'busy', 'ready', 'sending', 'testing', 'trial', 'finishing'] as const
export const DIAGNOSTIC_USB_ERRORS = ['device', 'selftest', 'transport', 'cancelled', 'stale', 'save', 'rollback', 'unknown'] as const
export const DIAGNOSTIC_BUILD_KINDS = ['octatrack-firmware', 'octatrack-base', 'elekloader'] as const
export const DIAGNOSTIC_BUILD_PHASES = ['preparing', 'composing', 'packing', 'verifying', 'building'] as const
export const DIAGNOSTIC_BUILD_ERRORS = ['input', 'selection', 'build', 'cancelled', 'unknown'] as const
export type DiagnosticBuildKind = typeof DIAGNOSTIC_BUILD_KINDS[number]
export type DiagnosticBuildPhase = typeof DIAGNOSTIC_BUILD_PHASES[number]
export type DiagnosticBuildError = typeof DIAGNOSTIC_BUILD_ERRORS[number]
/** Live site events carry only these fixed categories; the opted-in collector supplies an event id. */
export type SiteDiagnosticEvent =
  | { event: 'browser_error' | 'unhandled_rejection'; phase: 'browser'; area: DiagnosticSiteArea; kind: DiagnosticErrorKind }
  | { event: 'build_failed'; phase: DiagnosticBuildPhase; buildKind: DiagnosticBuildKind; error: DiagnosticBuildError }
export const DIAGNOSTIC_EVENTS = [...DIAGNOSTIC_USB_EVENTS, 'browser_error', 'unhandled_rejection', 'build_failed'] as const
export const DIAGNOSTIC_PHASES = [...DIAGNOSTIC_USB_PHASES, 'browser', ...DIAGNOSTIC_BUILD_PHASES] as const
export const DIAGNOSTIC_ERRORS = [...DIAGNOSTIC_USB_ERRORS, 'input', 'selection', 'build'] as const
export const DIAGNOSTIC_RESULTS = ['ok', 'state', 'unsafe', 'identity', 'limit', 'stale', 'length', 'conflict', 'hash', 'rejected', 'backend', 'needs-recovery'] as const
export interface DiagnosticReading {
  state: number; failed: number; modules: number; dsp: number; intact: number; ran: number
  cpu: number; tracks1to4: number; tracks5to8: number; frameGap: number
  saved: number; savedCount: number; live: number; culprit: number; refusal: number
}
export interface OctatrackDiagnostic {
  id: string
  event: typeof DIAGNOSTIC_EVENTS[number]
  phase: typeof DIAGNOSTIC_PHASES[number]
  buildKind?: DiagnosticBuildKind
  base?: string
  active?: string
  error?: typeof DIAGNOSTIC_ERRORS[number]
  result?: typeof DIAGNOSTIC_RESULTS[number]
  refusal?: number
  reading?: DiagnosticReading
  /** Public catalogue versions; inventory names and project references never enter this list. */
  modules?: { id: string; catalogVersion: string }[]
  packages?: { sha256: string; bytes: number }[]
  area?: DiagnosticSiteArea
  kind?: DiagnosticErrorKind
  live?: DiagnosticLive
  reason?: typeof DIAGNOSTIC_UNRESPONSIVE[number]
  log?: { loads: DeviceLoad[]; incidents: DeviceIncident[]; crash?: DeviceCrash; stall?: DeviceStall }
}
export interface DiagnosticConsent { accountId: string; enabled: boolean; version: string; changedAt: string | null; expiresAt: string | null }
export interface DiagnosticEntry { eventId: string; createdAt: string; data: OctatrackDiagnostic; username?: string }
