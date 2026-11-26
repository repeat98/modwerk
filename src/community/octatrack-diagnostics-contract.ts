// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

// Closed, versioned diagnostics: no arbitrary text, project data, USB serials, firmware or memory dumps.
/** 2026-11-11.1 adds each report's browser and OS family (`client`) and why a connection failed before it existed (`link_failed`).
 * 2026-11-19.1 says reports may lead to a personal email about a problem they show and its fix (server/diagnostics-mail.ts);
 * the owner chose to let it cover everyone already sharing (19 Nov 2026).
 * A consent given under an earlier version keeps sharing (owner, 14 Nov 2026): a new version is what new choices record,
 * never a reason to ask members again. */
export const OCTATRACK_DIAGNOSTICS_VERSION = '2026-11-19.1'
/** The versions the server takes reports and choices under: the current one and the one before, so a page still open on
 * the previous text keeps sending after a deploy instead of being refused until it is reloaded. */
export const OCTATRACK_DIAGNOSTICS_ACCEPTED: readonly string[] = [OCTATRACK_DIAGNOSTICS_VERSION, '2026-11-11.1']
/** The invitation's Not now is remembered under this version, not the current one, so a new text never asks again. */
export const DIAGNOSTICS_INVITATION_VERSION = '2026-11-11.1'
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
/** How far a run of the install guide got between opening and a first connection (BaseInstallDialog `onStep`), each at
 * most once per run, so the next look can see where people stop: the card steps (`card-…`, with `card-load-from-card`
 * for a browser without WebUSB, whose last step loads modules from the card), the OS file chosen or refused, the risk
 * accepted, the sign-in prompt asked, Connect pressed, and the USB update shown and started. */
export const BASE_GUIDE_STEPS = ['card-download', 'os-file-ready', 'os-file-refused', 'risk-accepted', 'sign-in-asked', 'card-copy', 'card-install', 'card-connect', 'card-load-from-card', 'connect-pressed', 'usb-update-shown', 'usb-update-started'] as const
export type BaseGuideStep = typeof BASE_GUIDE_STEPS[number]
/** Why a USB sync failed (octatrack-link.ts `sync_failed`, or the unit going away mid-sync), as one fixed reason for the
 * identifier-free counts: the base's refusal by its code (sdk/runtime/loader-refusals.json), a refusal without one,
 * playback that would not stop (`unsafe`), a transfer the unit did not confirm by the sync step it stopped in, and the
 * link's other error labels. Anything else is `other`. */
export const SYNC_FAILURE_REASONS = [
  'disconnected', 'cancelled', 'stale', 'save', 'selftest', 'rollback', 'unknown', 'unsafe', 'device',
  'refused', 'refused-1', 'refused-2', 'refused-3', 'refused-4', 'refused-5', 'refused-6', 'refused-7', 'refused-8', 'refused-9', 'refused-10', 'refused-11', 'refused-12',
  'transport', 'transport-session', 'transport-baseline', 'transport-encode', 'transport-stage', 'transport-activate', 'transport-trial',
  'other',
] as const
export type SyncFailureReason = typeof SYNC_FAILURE_REASONS[number]
/** The fixed reason for a failed sync from the link's own diagnostic (`sync_failed`) or a disconnect mid-sync. */
export function syncFailureReason(event: { event: string; error?: string; step?: string; result?: string; refusal?: number }): SyncFailureReason {
  const known = (reason: string) => (SYNC_FAILURE_REASONS as readonly string[]).includes(reason) ? reason as SyncFailureReason : 'other'
  if (event.event === 'disconnected') return 'disconnected'
  if (event.error === 'device') return event.refusal !== undefined && event.refusal > 0 ? known(`refused-${event.refusal}`)
    : event.result === 'unsafe' ? 'unsafe' : event.result === 'rejected' || event.result === 'backend' ? 'refused' : 'device'
  if (event.error === 'transport') return event.step ? known(`transport-${event.step}`) : 'transport'
  return event.error ? known(event.error) : 'other'
}
/** Each anonymous count with a category, the event name sent and stored, and the categories it takes (none: no category).
 * A count whose list ends in `other` stores any other category as `other`; the rest refuse it. */
export const OCTATRACK_STEP_COUNTS = {
  base_guide_opened: [], base_file_downloaded: [], base_first_connection: [], base_usb_update_done: [], base_install_failed: BASE_INSTALL_FAILURES,
  base_guide_step: BASE_GUIDE_STEPS, usb_sync_failed_reason: SYNC_FAILURE_REASONS,
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
 * unit dropped or refused); NoErrorObject when a browser error comes without one (a cross-origin or extension script,
 * a browser notice); anything else is OtherError. Never its message. */
export const DIAGNOSTIC_ERROR_KINDS = ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError', 'NetworkError', 'NotFoundError',
  'NotAllowedError', 'InvalidStateError', 'QuotaExceededError', 'SecurityError', 'DataError', 'TimeoutError', 'VendorTransportError', 'NoErrorObject', 'OtherError'] as const
export type DiagnosticSiteArea = typeof DIAGNOSTIC_SITE_AREAS[number]
export type DiagnosticErrorKind = typeof DIAGNOSTIC_ERROR_KINDS[number]
/** `load` and `unresponsive`: the connected unit's meters over the last minutes, per mille, as [mean, peak]; a meter
 * the unit hadn't refreshed is left out. `unresponsive`: `usb` when reads failed, `ui` when its UI tick stood still. */
export interface DiagnosticLive { samples: number; cpu?: [number, number]; dsp1to4?: [number, number]; dsp5to8?: [number, number] }
export const DIAGNOSTIC_UNRESPONSIVE = ['usb', 'ui'] as const
/** `device_log`: records from the unit's own log (diag.h), uploaded at the next connection. */
export const DEVICE_INCIDENTS = ['start', 'hot', 'freeze', 'crash', 'stall', 'set', 'base', 'shed', 'cpu', 'brake', 'usb', 'late', 'restore', 'freeze_pc'] as const
/** `frameGap`: the window's longest time between two audio frames, µs (log version 2); `tickGap` its longest run of
 * frames without a UI tick. */
export interface DeviceLoad { seq: number; boot: number; minute: number; cpu: [number, number]; dsp1to4: [number, number]; dsp5to8: [number, number]; samples: number; playing: number; frameGap?: number; tickGap?: number }
/** crash.c's record: the last error exception, with the eight longs at its PC read cached and uncached (log version 2). */
export interface DeviceCrash { count: number; vector: number; pc: number; sr: number; sp: number; d: number[]; a: number[]; stack: number[]; code: number[]; memory: number[] }
/** dsp.c's record of the last DSP stall: why (1 frames stopped, 2 eDMA refused, 0 a test), the tick, the loader's report words.
 * `frames`: the frames before it, oldest first, two numbers each in µs (diag.h's trace): the time since the frame before
 * began (363 on time) and how long the frame interrupt before it ran. Bases without the trace send none.
 * `packets`: each core's last loader packet header, eight 16-bit words (the record's tx[2][8]); sites before
 * 16 November 2026 sent none. `host`: the host port's status (the record's isr[2]): the selected core's ISR when the
 * stall was found, and core 1's as dsp_core1.s last read it; sites before 27 November 2026 sent none. */
export interface DeviceStall { count: number; reason: number; ticks: number; report: number[]; frames?: number[]; packets?: number[][]; host?: number[] }
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
/** A stall in a line: its frames (the last gaps, the longest with the run before it, and whether one of the last frames
 * began in the late entry's window, docs/MODULE_PERFORMANCE.md: about 150 µs late after a long frame), then each core's
 * last packet and whether a publication was under way (describeStallPackets). '' when the record holds none of these. */
export function describeStallFrames(frames: number[] | undefined, stall?: Pick<DeviceStall, 'packets' | 'report' | 'host'>): string {
  return [frames?.length ? stallFrames(frames) : '', describeStallPackets(stall)].filter(Boolean).join('; ')
}
function stallFrames(frames: number[]): string {
  const gaps = frames.filter((_, i) => i % 2 === 0), runs = frames.filter((_, i) => i % 2 === 1), longest = gaps.indexOf(Math.max(...gaps))
  const late = stallLateness(frames), from = Math.max(0, late.length - LATE_TAIL)
  const hit = late.reduce((found, us, i) => i >= from && us >= LATE_WINDOW[0] && us <= LATE_WINDOW[1] ? i : found, -1)
  return `${gaps.length} frames before it: last gaps ${gaps.slice(-8).join(' ')} us (363 is on time); longest ${gaps[longest]} us, ${gaps.length - 1 - longest} frames before the last, ` +
    `after a frame interrupt of ${runs[longest]} us (the longest ran ${Math.max(...runs)} us); the last began ${late.slice(-LATE_TAIL).join(' ')} us late: ` +
    (hit < 0 ? `none ${LATE_WINDOW[0]} to ${LATE_WINDOW[1]} us late, so not the late entry`
      : `one ${late[hit]} us late, ${late.length - 1 - hit} before the last, after a frame interrupt of ${runs[hit]} us: fits the late entry (${LATE_WINDOW[0]} to ${LATE_WINDOW[1]} us)`)
}
/** The loader's packet opcodes (header word 2): 1 and 3-9 from dsp_receiver.asm's packet comment and its dispatch at
 * `coldops`, 2 STAGE from the transport's transfer.h enum, 10 PLACE and 11 the fixed reset from the resident transport
 * (module-adapters/resident_dsp.py receiver_place, resident_driver.py transport). */
const PACKET_KINDS = ['', 'PROBE', 'STAGE', 'WRITE', 'BIND', 'UNBIND', 'BYPASS', 'BASE', 'PEEK', 'SUM', 'PLACE', 'RESET'], PACKET_MAGIC = 0x4c44
/** The manager's phases (the transport's manager.c advance): what it sends in each. */
const MANAGER_PHASES = ['', 'planning', 'writing', 'binding', 'bypassing', 'ready', 'unbinding the old', 'rolling back', 'writing tables', 'restoring tables']
/** One core's last packet from its header (dsp_receiver.asm: 0 magic, 1 sequence, 2 opcode, 3 core, 4 count or id,
 * 5 offset or init, 6 checksum, 7 proc, a WRITE's sum or a RESET's feature). The ColdFire clears the magic once the core
 * answers or after 64 frames without an answer (transfer.c dl_frame); the record is taken before anything else clears
 * it (dsp.c recover), so a magic still there is a packet in flight when the frames stopped: sent in their last frames.
 * Only dl_frame writes the header, so it is the last packet before the stop even when the record came later. */
export function describeStallPacket(header: number[]): string {
  if (header.length < 8 || header.every(word => !word)) return 'none'
  const [magic, , op, , a, b, , c] = header, kind = PACKET_KINDS[op]
  const what = op === 3 || op === 9 ? `${kind} ${a} words at table offset ${b}` : op === 4 ? `BIND id ${a}, init ${b} proc ${c}`
    : op === 5 || op === 6 ? `${kind} id ${a}` : op === 7 ? `BASE entry ${a}` : op === 8 ? `PEEK P:$${b.toString(16)}`
      : op === 10 ? `PLACE feature ${a} at table offset ${b}` : op === 11 ? `RESET feature ${c}, ${a} words at table offset ${b}` : kind || `opcode ${op} (unknown)`
  return what + (magic === PACKET_MAGIC ? ', in flight when the frames stopped' : magic ? `, magic $${magic.toString(16)}` : ', answered or timed out')
}
/** Each core's last packet, and whether the loader's manager was publishing (a pick, a Part change or an install) when
 * the stall was found: the report's `manager` word, phase in its low byte (0 idle). The watchdog finds a stall only
 * while a job waits (OCTATRACK_HARDWARE_TRAPS.md), so a publication may have begun after the frames stopped. */
export function describeStallPackets(stall: Pick<DeviceStall, 'packets' | 'report' | 'host'> | undefined): string {
  const lines = (stall?.packets ?? []).map((header, core) => `core ${core} last packet: ${describeStallPacket(header)}`)
  const report = (stall?.report?.[0] ?? 0) >= 11 ? stall?.report : undefined, word = (name: string) => report?.[DSP_REPORT_NAMES.indexOf(name)]
  const manager = word('manager'), phase = (manager ?? 0) & 0xff
  if (manager !== undefined) lines.push(phase ? `a pick, Part change or install under way when it was found (manager phase ${phase}${MANAGER_PHASES[phase] ? ', ' + MANAGER_PHASES[phase] : ''})` : 'no pick, Part change or install under way when it was found')
  // A job still waiting (status 0) whose core's header carries no magic was queued but never sent (transfer.c sends a
  // queued job at the next frame): the frames had stopped before it, so it found the stall and did not cause it.
  const unsent = [0, 1].filter(core => word(core ? 'job1' : 'job0') === 0 && stall?.packets?.[core]?.length && stall.packets[core][0] !== PACKET_MAGIC)
  if (unsent.length) lines.push(`the waiting job on core ${unsent.join(' and ')} was never sent: the frames had stopped before it`)
  // dsp.c's HOST_ISR: bit 0 RXDF (the core holds a word the ColdFire never took, so it waits at P:$97), bit 1 TXDE.
  const isr = stall?.host?.[0], select = (word('eportPinFlagSelect') ?? 0) & 0xff
  if (isr !== undefined) lines.push(`core ${select} host port: ${isr & 1 ? 'a word waiting for the ColdFire (RXDF), so the core waits at P:$97 for it' : 'no word waiting for the ColdFire, so the core was not waiting on the host'}` +
    (isr & 2 ? '' : ", and it had not taken the ColdFire's last word (TXDE clear)"))
  return lines.join('; ')
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
export const DIAGNOSTIC_USB_ERRORS = ['device', 'selftest', 'transport', 'cancelled', 'stale', 'save', 'rollback', 'unknown', 'disconnected'] as const
/** How a disconnected trial stopped waiting. Timeout includes a returning interface that could not be claimed in time. */
export const TRIAL_RECONNECT_FAILURES = ['timeout', 'closed', 'mismatch', 'unreadable', 'lost-again'] as const
/** `sync_failed`: the step of a sync that failed (octatrack-link.ts load), so a failure with no device refusal still
 * says where it stopped: opening the session, reading the installed set, packing the set, sending it, the unit
 * loading it, or starting the trial. */
export const DIAGNOSTIC_SYNC_STEPS = ['session', 'baseline', 'encode', 'stage', 'activate', 'trial'] as const
export type DiagnosticSyncStep = typeof DIAGNOSTIC_SYNC_STEPS[number]
export const STAGING_COMMANDS = ['enter', 'begin', 'chunk', 'verify', 'abort', 'rollback', 'leave'] as const
export type StagingCommand = typeof STAGING_COMMANDS[number]
export const isStagingCommand = (value: unknown): value is StagingCommand => STAGING_COMMANDS.some(command => command === value)
/** Upload v1 schema bounds: a 2 MiB staged set and a 48-byte header, 4-byte offset and 4096-byte payload. */
export const STAGING_SET_BYTES = 2 * 1024 * 1024, STAGING_FRAME_BYTES = 48 + 4 + 4096
/** The type of build. An elekloader build names its machine, so a failure says which machine it was for; plain
 * `elekloader` is what records sent before that say, and what a machine missing from the list falls back to. */
export const DIAGNOSTIC_ELEKLOADER_MACHINES = ['digitakt', 'digitakt-ii', 'digitone', 'analog-rytm-mkii'] as const
export const DIAGNOSTIC_BUILD_KINDS = ['octatrack-firmware', 'octatrack-base', 'elekloader',
  ...DIAGNOSTIC_ELEKLOADER_MACHINES.map(machine => `elekloader-${machine}` as const)] as const
/** The build kind of an elekloader build for `machine`: its own value, else plain `elekloader`. */
export function elekloaderBuildKind(machine: string): DiagnosticBuildKind {
  return (DIAGNOSTIC_ELEKLOADER_MACHINES as readonly string[]).includes(machine) ? `elekloader-${machine as typeof DIAGNOSTIC_ELEKLOADER_MACHINES[number]}` : 'elekloader'
}
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
  /** A `sync_failed` the base refused as `unsafe`: what kept the change from beginning, as the base's self-test record
   * said right after (runtime.h MACHINE_BUSY_*: 1 a track's recorder records, 2 its other recorder row is pending or
   * unknown, 3 the transport runs, 4 a track runs, 5 the loader's journal is busy), the track (0-15) in the high
   * nibble; 0 nothing any more, or a base before 0.8.2. */
  busy?: number
  reading?: DiagnosticReading
  /** On `health` after a start that loaded only part of the card's set (`reading.saved` 6 or 10): each module that start
   * left out (the base's RESTORE request), by catalogue id or `other`, with the loader's refusal (256 the boot guard) and
   * check. Never a module's name. */
  restore?: { id: string; refusal: number; check: number }[]
  /** Public catalogue versions; inventory names and project references never enter this list. */
  modules?: { id: string; catalogVersion: string }[]
  packages?: { sha256: string; bytes: number }[]
  area?: DiagnosticSiteArea
  /** A browser error's type, an unclassified (`unknown`) sync failure's, or what stopped a `transport` one: the
   * browser's USB error, TimeoutError (no reply in time), VendorTransportError (the unit dropped or refused the
   * submission), OtherError (a reply that did not confirm the step). Never a message. */
  kind?: DiagnosticErrorKind
  step?: DiagnosticSyncStep
  reconnect?: typeof TRIAL_RECONNECT_FAILURES[number]
  /** A `transport` sync failure's change in the base's EP0 counters over the sync (DIAG version 3, ep0.c): frames
   * received, refusals, bus resets, data stages primed, completed and abandoned; from 26 November 2026 a seventh entry,
   * the last completed data stage's descriptor status byte (0x40 halted, 0x20 data buffer error, 0x08 transaction error),
   * as it stands after the sync: it belongs to this sync only when the completed count rose. */
  usb?: number[]
  /** Offset into the staged package (CHUNK only). Remaining bytes refer to the entire EP0 OUT frame. */
  upload?: { command: StagingCommand; chunkOffset?: number; remainingBytes?: number }
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

/** The stock tasks by TCB (octabam's STEM_REC.md task census, OS 1.40C): entry and priority, higher runs first. */
const TASKS = new Map<number, string>([[0x46c7bed8, 'UI task 0x40061a94, priority 1'], [0x460ddde4, 'engine task 0x4008445c (card jobs), priority 1'],
  [0x46105508, 'task 0x40098a5c, priority 1'], [0x460e0e38, 'task 0x4009203c, priority 2'], [0x460fab80, 'task 0x40091d18, priority 2'],
  [0x460ffd44, 'task 0x400921c4, priority 2'], [0x460d59d4, 'housekeeping task 0x40056c40, priority 3'],
  [0x460d4f80, 'key-repeat task 0x4005593c, priority 4'], [0x460bcc2c, 'USB task 0x4001ee30, priority 5'], [0x46c7fb0c, 'task 0x40005540, priority 6']])
/** A FREEZE_PC record (diag.h, bases from 0.8.2), right after the FREEZE it belongs to: where the processor was at 5, 6,
 * 7 and 8 s of that freeze, as the audio frame's eDMA interrupt found it. `level` is the interrupted priority level
 * (above 0: an interrupt handler), `task` the kernel's current task. A sample after the tick moved again is left out. */
export function freezeSamples(r: DeviceIncident): { pc: number; sr: number; level: number; tcb: number; task: string }[] {
  const long = (i: number) => (r.machines[i] << 24 | r.machines[i + 1] << 16 | r.machines[i + 2] << 8 | r.machines[i + 3]) >>> 0
  const pcs = [r.a, r.screen, r.tempo24, long(16)], srs = [r.cpu, r.dsp5to8, r.dsp1to4, r.machines[20] << 8 | r.machines[21]]
  return pcs.map((pc, i) => ({ pc, sr: srs[i], level: srs[i] >> 8 & 7, tcb: long(4 * i), task: TASKS.get(long(4 * i)) ?? 'TCB 0x' + long(4 * i).toString(16) }))
    .filter(s => s.pc || s.sr || s.tcb)
}
