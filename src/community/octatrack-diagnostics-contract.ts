// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

// Closed, versioned diagnostics: no arbitrary text, project data, USB serials, firmware or memory dumps.
/** 2026-11-11.1 adds each report's browser and OS family (`client`) and why a connection failed before it existed (`link_failed`). */
export const OCTATRACK_DIAGNOSTICS_VERSION = '2026-11-11.1'
export const DIAGNOSTIC_RETENTION_DAYS = 30
export const DIAGNOSTIC_CONSENT_DAYS = 90
export const OCTATRACK_COUNTS = ['usb_sync_started', 'usb_sync_kept', 'usb_sync_undone', 'usb_sync_failed'] as const
export type OctatrackCount = typeof OCTATRACK_COUNTS[number]
/** The base install guide's steps, counted per day without any identifier like the sync actions (usage.ts countBaseInstall). */
export const BASE_INSTALL_STAGES = ['opened', 'file-downloaded', 'first-connection', 'usb-update-done', 'failed'] as const
export type BaseInstallStage = typeof BASE_INSTALL_STAGES[number]
/** Why the guide failed: the reasons it can report (BaseInstallDialog's BaseGuideFailure), and `other`, which the
 * browser and the server store for any reason not in this list. */
export const BASE_INSTALL_FAILURES = ['no-webusb', 'site-outdated', 'build-failed', 'link-lost', 'update-refused', 'update-failed', 'wrong-base', 'other'] as const
export type BaseInstallFailure = typeof BASE_INSTALL_FAILURES[number]
/** Where the diagnostics invitation was shown: the install guide's last step, after a failure, on the first connection
 * in the hub or workspace (DiagnosticsInvitationGate), or opened by the member from the Diagnostics settings. */
export const DIAGNOSTIC_INVITATION_PLACEMENTS = ['guide', 'after-failure', 'hub', 'settings'] as const
export type DiagnosticInvitationPlacement = typeof DIAGNOSTIC_INVITATION_PLACEMENTS[number]
export const DIAGNOSTIC_INVITATION_OUTCOMES = ['shown', 'shared', 'not-now'] as const
export type DiagnosticInvitationOutcome = typeof DIAGNOSTIC_INVITATION_OUTCOMES[number]
/** Each anonymous count with a category, the event name sent and stored, and the categories it takes (none: no category). */
export const OCTATRACK_STEP_COUNTS = {
  base_guide_opened: [], base_file_downloaded: [], base_first_connection: [], base_usb_update_done: [], base_install_failed: BASE_INSTALL_FAILURES,
  diagnostics_invite_shown: DIAGNOSTIC_INVITATION_PLACEMENTS, diagnostics_invite_shared: DIAGNOSTIC_INVITATION_PLACEMENTS, diagnostics_invite_not_now: DIAGNOSTIC_INVITATION_PLACEMENTS,
} as const satisfies Record<string, readonly string[]>
export type OctatrackStepCount = keyof typeof OCTATRACK_STEP_COUNTS
export const BASE_INSTALL_COUNTS: Record<BaseInstallStage, OctatrackStepCount> = { opened: 'base_guide_opened', 'file-downloaded': 'base_file_downloaded', 'first-connection': 'base_first_connection', 'usb-update-done': 'base_usb_update_done', failed: 'base_install_failed' }
export const INVITATION_COUNTS: Record<DiagnosticInvitationOutcome, OctatrackStepCount> = { shown: 'diagnostics_invite_shown', shared: 'diagnostics_invite_shared', 'not-now': 'diagnostics_invite_not_now' }
/** A report's browser and operating system, as families from a coarse parse (diagnostic-client.ts); `major` is the
 * browser's main version. Never the user-agent string. */
export const DIAGNOSTIC_BROWSERS = ['chrome', 'edge', 'opera', 'brave', 'samsung', 'firefox', 'safari', 'other'] as const
export const DIAGNOSTIC_SYSTEMS = ['windows', 'macos', 'linux', 'chromeos', 'android', 'ios', 'other'] as const
export interface DiagnosticClient { browser: typeof DIAGNOSTIC_BROWSERS[number]; major?: number; os: typeof DIAGNOSTIC_SYSTEMS[number] }
/** `link_failed`: why connecting to the Octatrack failed before a link existed. No timeout: until the link exists,
 * nothing the page waits for has one (octatrack-link.ts opening). */
export const PRE_LINK_FAILURES = ['no-webusb', 'no-device', 'permission-denied', 'open-failed', 'claim-failed'] as const
export type PreLinkFailure = typeof PRE_LINK_FAILURES[number]
export const DIAGNOSTIC_USB_EVENTS = ['connected', 'disconnected', 'sync_started', 'sync_failed', 'selftest', 'health', 'kept', 'undone', 'load', 'unresponsive', 'device_log'] as const
/** The part of the site a browser error happened on, from the page's route: a fixed name, never the address. */
export const DIAGNOSTIC_SITE_AREAS = ['library', 'configuration', 'octatrack', 'module', 'forum', 'account', 'admin', 'other'] as const
/** An error's type, by its standard name, or one of the USB link's own two (a reply that timed out, a submission the
 * unit dropped or refused); anything else is OtherError. Never its message. */
export const DIAGNOSTIC_ERROR_KINDS = ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError', 'NetworkError', 'NotFoundError',
  'NotAllowedError', 'InvalidStateError', 'QuotaExceededError', 'SecurityError', 'DataError', 'TimeoutError', 'VendorTransportError', 'OtherError'] as const
export type DiagnosticSiteArea = typeof DIAGNOSTIC_SITE_AREAS[number]
export type DiagnosticErrorKind = typeof DIAGNOSTIC_ERROR_KINDS[number]
/** `load` and `unresponsive`: the connected unit's meters over the last minutes, per mille, as [mean, peak]; a meter
 * the unit hadn't refreshed is left out. `unresponsive`: `usb` when reads failed, `ui` when its UI tick stood still. */
export interface DiagnosticLive { samples: number; cpu?: [number, number]; dsp1to4?: [number, number]; dsp5to8?: [number, number] }
export const DIAGNOSTIC_UNRESPONSIVE = ['usb', 'ui'] as const
/** `device_log`: records from the unit's own log (diag.h), uploaded at the next connection. */
export const DEVICE_INCIDENTS = ['start', 'hot', 'freeze', 'crash', 'stall', 'set', 'base', 'shed', 'cpu'] as const
/** `frameGap`: the window's longest time between two audio frames, µs (log version 2); `tickGap` its longest run of
 * frames without a UI tick. */
export interface DeviceLoad { seq: number; boot: number; minute: number; cpu: [number, number]; dsp1to4: [number, number]; dsp5to8: [number, number]; samples: number; playing: number; frameGap?: number; tickGap?: number }
/** crash.c's record: the last error exception, with the eight longs at its PC read cached and uncached (log version 2). */
export interface DeviceCrash { count: number; vector: number; pc: number; sr: number; sp: number; d: number[]; a: number[]; stack: number[]; code: number[]; memory: number[] }
/** dsp.c's record of the last DSP stall: why (1 frames stopped, 2 eDMA refused, 0 a test), the tick, the loader's report words.
 * `frames`: the frames before it, oldest first, two numbers each in µs (diag.h's trace): the time since the frame before
 * began (363 on time) and how long the frame interrupt before it ran. Bases without the trace send none. */
export interface DeviceStall { count: number; reason: number; ticks: number; report: number[]; frames?: number[] }
const FRAME_US = 363, LATE_WINDOW = [110, 190] as const, LATE_TAIL = 6
/** How late each of a stall's frames began against the DSP's frame grid, in µs: the lateness before it plus its gap
 * less one frame, never under 0. Past a whole frame (or within 20 µs of one) the DSP has skipped that frame, and a gap
 * of four frames or more starts again on time. The trace stamps a frame at dl_frame, not at the interrupt's entry, and
 * the upload rounds to 1 µs, so read these to about 5 µs. */
export function stallLateness(frames: number[]): number[] {
  let late = 0
  return frames.filter((_, i) => i % 2 === 0).map((gap, i) => {
    late = i === 0 || gap >= 4 * FRAME_US ? 0 : Math.max(0, late + gap - FRAME_US)
    while (late >= FRAME_US - 20) late = Math.max(0, late - FRAME_US)
    return late
  })
}
/** A stall's frames in a line: the last gaps, the longest with the run before it, and whether one of the last frames
 * began in the late entry's window (docs/MODULE_PERFORMANCE.md: about 150 µs late after a long frame). '' without a trace. */
export function describeStallFrames(frames: number[] | undefined): string {
  if (!frames?.length) return ''
  const gaps = frames.filter((_, i) => i % 2 === 0), runs = frames.filter((_, i) => i % 2 === 1), longest = gaps.indexOf(Math.max(...gaps))
  const late = stallLateness(frames), from = Math.max(0, late.length - LATE_TAIL)
  const hit = late.reduce((found, us, i) => i >= from && us >= LATE_WINDOW[0] && us <= LATE_WINDOW[1] ? i : found, -1)
  return `${gaps.length} frames before it: last gaps ${gaps.slice(-8).join(' ')} us (363 is on time); longest ${gaps[longest]} us, ${gaps.length - 1 - longest} frames before the last, ` +
    `after a frame interrupt of ${runs[longest]} us (the longest ran ${Math.max(...runs)} us); the last began ${late.slice(-LATE_TAIL).join(' ')} us late: ` +
    (hit < 0 ? `none ${LATE_WINDOW[0]} to ${LATE_WINDOW[1]} us late, so not the late entry`
      : `one ${late[hit]} us late, ${late.length - 1 - hit} before the last, after a frame interrupt of ${runs[hit]} us: fits the late entry (${LATE_WINDOW[0]} to ${LATE_WINDOW[1]} us)`)
}
/** The loader's report words, as the stall record and the development report (scripts/device.mjs) carry them
 * (dsp.c modwerk_dsp_report, version 11; version 12 adds the effect masks' further words and a pad at the end). */
export const DSP_REPORT_NAMES = ['version', 'frames', 'phase', 'job0', 'job1', 'hostFlags', 'accepted0', 'accepted1', 'rejected0', 'rejected1',
  'errors', 'stalls', 'drained', 'residencyEnabled', 'manager', 'watchTicks', 'probesSent', 'probesAnswered', 'probesTimedOut',
  'selRequested', 'selCompleted', 'selRefused', 'selCancelled', 'resCommits', 'resFailures', 'resRollbacks',
  'words0', 'words1', 'earlyVisits', 'parked', 'reinit', 'missing', 'used', 'dry',
  'frameState', 'frameBusy', 'intcIprl', 'intcImrl', 'eportPinFlagSelect', 'edmaIntErr', 'csr0csr1', 'edmaEs',
  'edmaErrors', 'edmaEsSeen', 'missCore', 'missBits', 'missCheck', 'miss0', 'miss1', 'miss2', 'pin7', 'straddles', 'core1Sent',
  'meterCore', 'meterBits', 'meterSerial', 'idleLeast', 'idleMost', 'idleSum', 'missed', 'mapGeneration', 'mapRead', 'mapWritten', 'setGeneration', 'setModules', 'setResult',
  'cpu', 'dsp0Mean', 'dsp0Peak', 'dsp1Mean', 'dsp1Peak', 'buffers', 'poolUsed', 'modules', 'idleWrap', 'arenas', 'idleSum0', 'idleSum1']
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
/** `sync_failed`: the step of a sync that failed (octatrack-link.ts load), so a failure with no device refusal still
 * says where it stopped: opening the session, reading the installed set, packing the set, sending it, the unit
 * loading it, or starting the trial. */
export const DIAGNOSTIC_SYNC_STEPS = ['session', 'baseline', 'encode', 'stage', 'activate', 'trial'] as const
export type DiagnosticSyncStep = typeof DIAGNOSTIC_SYNC_STEPS[number]
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
export const DIAGNOSTIC_EVENTS = [...DIAGNOSTIC_USB_EVENTS, 'browser_error', 'unhandled_rejection', 'build_failed', 'link_failed'] as const
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
  /** A browser error's type, an unclassified (`unknown`) sync failure's, or what stopped a `transport` one: the
   * browser's USB error, TimeoutError (no reply in time), VendorTransportError (the unit dropped or refused the
   * submission), OtherError (a reply that did not confirm the step). Never a message. */
  kind?: DiagnosticErrorKind
  step?: DiagnosticSyncStep
  live?: DiagnosticLive
  reason?: typeof DIAGNOSTIC_UNRESPONSIVE[number]
  log?: { loads: DeviceLoad[]; incidents: DeviceIncident[]; crash?: DeviceCrash; stall?: DeviceStall }
  /** On every report but `device_log`. */
  client?: DiagnosticClient
  failure?: PreLinkFailure
}
/** The `accountId` of a visitor who shares without an account: their reports are kept under a random ID their browser
 * made when they agreed (sent as X-Modwerk-Diagnostics-Guest; the server stores only its SHA-256). */
export const DIAGNOSTICS_GUEST = 'guest'
export interface DiagnosticConsent { accountId: string; enabled: boolean; version: string; changedAt: string | null; expiresAt: string | null }
export interface DiagnosticEntry { eventId: string; createdAt: string; data: OctatrackDiagnostic; username?: string }
