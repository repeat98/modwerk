// SPDX-License-Identifier: GPL-3.0-or-later
// The site's USB link to an Octatrack running the Modwerk base: find the unit,
// send a module set's runtime packages, run the last as a trial, then keep or
// undo it. The base itself undoes anything not kept when USB goes quiet or away,
// so every failure here ends in "unplug to undo" at worst.
import { runSelftest, waitUntilSaved } from './selftest.ts'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { UploadDeviceError, UploadSession, UploadUnconfirmedError } from './upload-session.ts'
import type { UploadResultName } from './upload-wire.ts'
import { findVendorInterface, RuntimeFeature, UsbVendorTransport, type BaseSlots, type ControlDevice, type MissingModule, type SelftestRecord, type VendorIdentity } from './upload-usb.ts'
import * as formats from '../../../vendor/elekloader/kit/src/formats.ts'
import type { ElekFile } from '../../../vendor/elekloader/kit/src/elek.ts'
import { OCTATRACK } from '../../../vendor/elekloader/kit/src/devices.ts'
import type { OctatrackDiagnostic, DiagnosticReading } from '../../community/octatrack-diagnostics-contract'
import { encodeModuleSet } from './set-package.ts'
import { diagnosticErrorKind } from '../../community/site-diagnostic-events'

export type LinkDiagnostic = Omit<OctatrackDiagnostic, 'id' | 'modules'>
/** Numeric status fields only; exclude the device's free-text culprit name. */
export function diagnosticReading(record: SelftestRecord): DiagnosticReading {
  const {state,failed,modules,dsp,intact,ran,frameGap,saved,savedCount,live,culprit,refusal,peaks} = record
  return {state,failed,modules,dsp,intact,ran,frameGap,saved,savedCount,live,culprit,refusal,cpu:peaks.cpu,tracks1to4:peaks.tracks1to4,tracks5to8:peaks.tracks5to8}
}

export const ELEKTRON_VENDOR_ID = 0x1935
/** Where a retry alone won't help: Linux needs a udev rule, and Windows binds WinUSB only to the base's interface
 * (docs/OCTATRACK_HARDWARE_TRAPS.md, USB and EP0), so a unit on the original OS can't be opened there at all. */
export function openFailure(agent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const why = /Windows/.test(agent) ? ' On Windows that works only once it runs the Modwerk base: with the original OS, install the base from the card first.'
    : /Linux/.test(agent) && !/Android/.test(agent) ? ' On Linux, Chrome needs permission first: see Can’t connect? in Setup.' : ''
  return 'Chrome couldn’t open the Octatrack.' + (why || ' Unplug it, plug it back in and try again.')
}
/** Well inside the base's 10 s quiet limit (sdk/runtime/upload/vendor.c mv_tick); any vendor request counts. */
const KEEPALIVE_MS = 1000
/** Asked while playing, the base presses STOP itself and answers `unsafe` that once; ask again until it has stopped. */
const STOP_RETRY_MS = 200
/** A whole set publishes and restores one row per engine turn (20 rows took 3.8 s at the 200 ms retry interval):
 * 500 ms a row, 10 s at least, so a set of up to 128 changes is not cut off midway. */
const setBudget = (rows: number) => Math.max(10000, 500 * rows)
/** How often a unit another window or app holds is tried again, so it connects once they let go. */
const BUSY_RETRY_MS = 3000
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// lib.dom has no WebUSB types; only what the link calls.
export interface LinkDevice extends ControlDevice {
  readonly configuration: Parameters<typeof findVendorInterface>[0]
  readonly opened: boolean
  open(): Promise<void>; close(): Promise<void>
  selectConfiguration(value: number): Promise<void>
  claimInterface(index: number): Promise<void>; releaseInterface(index: number): Promise<void>
}
type DeviceListener = (event: { device: LinkDevice }) => void
export interface LinkUsb {
  requestDevice(options: { filters: { vendorId: number }[] }): Promise<LinkDevice>
  getDevices(): Promise<LinkDevice[]>
  addEventListener(type: 'connect' | 'disconnect', listener: DeviceListener): void
  removeEventListener(type: 'connect' | 'disconnect', listener: DeviceListener): void
}
export type LinkSession = Pick<UploadSession, 'status' | 'connectionTrusted' | 'stage' | 'activate' | 'startTrial' | 'holdTrial' |
  'accept' | 'rollback' | 'cancel' | 'adopt' | 'leaveUploadMode'>
type Connect = (transport: UsbVendorTransport, base: string, options?: { timeoutMs?: number }) => Promise<LinkSession>
/** A base update over USB, step by step: the new base staged and started from RAM (the trial), then, running, writing its own
 * container to NOR and restarting on it. */
export type BaseUpdateStep = 'staging' | 'starting' | 'started' | 'writing' | 'reconnecting' | 'restarting' | 'done'
/** A base write ended without a verdict this many times: the user is told to keep the unit on and try again. */
const BASE_WRITE_ATTEMPTS = 4
/** How long a unit may take to come back after a write step failed (a slow NOR erase, then the restart). */
const RECONNECT_MS = 120000
/** Connected this long without going away again: any restart the reconnect set off has happened. */
const STEADY_MS = 2000
/** Two slots: the old base stays in the other slot, so nothing is at risk; a new base that hangs at its start is left
 * after two. */
const NEW_BASE_LATE = 'The Octatrack didn’t come back on the new base. If it hangs while starting, switch it off and on again: after two starts that fail, it goes back to its previous base by itself.'
const UNCONFIRMED = 'The Octatrack hasn’t confirmed that the new base is saved. Keep it switched on, check the USB cable and press Try again. Switched off before the save is confirmed, it may need the startup menu’s MIDI recovery to start again.'
/** The running base refused the container before writing anything (flash.c's checks). */
class NothingWritten extends Error {}

/** One step of a module set load: a runtime package, and the package that puts back what it changes (absent when the
 * site has none, such as for a removed module it does not publish). */
export interface SetChange { readonly module: string; readonly data: Uint8Array; readonly undo?: Uint8Array }

export type LinkStatus = 'unsupported' | 'idle' | 'connecting' | 'stock' | 'busy' | 'ready' | 'sending' | 'testing' | 'trial' | 'finishing'
export interface LinkState {
  readonly status: LinkStatus
  /** From IDENTIFY. `ready` without `canSubmit` is a base this page cannot send to. */
  readonly identity?: VendorIdentity
  /** HELLO's running set: the base's own digest while no module runs; null or absent when unknown. */
  readonly active?: string | null
  readonly module?: string
  /** 0–1 while sending. */
  readonly progress?: number
  /** The trial passed the stress test. */
  readonly tested?: boolean
  readonly notice?: { tone: 'success' | 'error'; text: string }
  /** A base update over USB is running (updateBase), through its restarts: the cable must stay in. */
  readonly baseUpdate?: BaseUpdateStep
  /** Where the base lives in the unit's flash (SLOTS, flash.h): on two slots an update restarts the unit once. */
  readonly slots?: BaseSlots | null
}

const REFUSED: Partial<Record<UploadResultName, string>> = {
  unsafe: 'Stop playback or finish recording on the Octatrack to continue.',
  identity: 'This module was built for a different Modwerk base.',
  limit: 'This module is too big for the Octatrack’s free memory.',
  length: 'This module is too big for the Octatrack’s free memory.',
  hash: 'The module arrived damaged. Nothing changed; send it again.',
  rejected: 'The Octatrack can’t run this module file.',
}
/** Why the loader rejected a module (sdk/runtime/loader/loader.h runtime_refusal), read from the base after a "rejected". */
const REJECTED: Partial<Record<number, string>> = {
  2: 'There isn’t enough module memory left on the Octatrack. Remove a module, then try again.',
  3: 'This module changes the same part of the Octatrack as one that’s already installed.',
  4: 'The Octatrack has no room for another module. Remove one, then try again.',
  5: 'The Octatrack is still loading module code. Try again in a moment.',
  6: 'This module needs more DSP time than an effect slot has.',
  7: 'A track is playing this module’s effect, so the Octatrack can’t change it now. Pick another effect on that track, then try again.',
  9: 'This version of the module changes a part of the Octatrack that the base now shares between modules. Install its newer version.',
  10: 'The Octatrack can’t start the key bus this module needs until it restarts. Turn it off and on, then sync again.',
}
const UNPLUG = 'Unplug the USB cable to undo anything unfinished, then plug it back in.'
/** The boot stub started the previous base after the new one failed to start three times (BaseSlots.fellBack). */
const FELL_BACK = 'The last base update didn’t start, so your Octatrack went back to its previous base. Nothing was lost. Try the update again, and report it in #beta-testers on Discord.'
const RECOVERED = 'The Octatrack missed a reply, so nothing changed. Try again.'

/** A stress test found a problem; its reason is shown to the user. */
export class StressTestFailure extends Error {}
/** The unit changed between planning a load and sending it (another tab loaded first). */
export class StaleLoadError extends Error {}
class WholeSetBaseRequired extends Error {}

/** What a failed step means for the user, in their words. */
export function explainLinkError(error: unknown): string {
  if (error instanceof StressTestFailure) return `The self-test failed: ${error.message}. Nothing was kept.`
  if (error instanceof StaleLoadError) return 'Another tab changed your Octatrack meanwhile, so nothing was synced. Review the sync again.'
  if (error instanceof WholeSetBaseRequired) return 'Install the latest Modwerk base before syncing several module changes together. Nothing was sent.'
  if (error instanceof DOMException && error.name === 'AbortError') return 'Cancelled. Nothing changed on the Octatrack.'
  if (error instanceof UploadDeviceError) return REFUSED[error.status.result] ?? 'The Octatrack refused this step.'
  if (error instanceof UploadUnconfirmedError) return 'The Octatrack stopped answering.'
  return 'Something went wrong talking to the Octatrack.'
}
const unsafe = (error: unknown) => error instanceof UploadDeviceError && error.status.result === 'unsafe'
const LOADING: LinkStatus[] = ['sending', 'testing', 'trial', 'finishing']

/** The read could not ask the unit just now (not idle, another tab or app holds it, or the transfer failed): try again
 * later. A base that does not know the request is not this error; its read resolves to undefined. */
export class LinkBusyError extends Error { readonly retry = true }

/** The Web Locks the link takes, so tabs of the site never claim the unit at once (`navigator.locks`; tests share a fake). */
export interface UsbLocks { request<T>(name: string, options: { signal?: AbortSignal }, job: (lock: unknown) => Promise<T>): Promise<T> }
/** The Web Lock every USB job of the site takes; a remote debug session holds it for its whole length. */
export const USB_LOCK = 'modwerk-octatrack-usb'
const LOCK = USB_LOCK, READ_WAIT_MS = 1000
/** Without Web Locks: one job at a time within this tab, as before; `signal` gives up a turn not yet started. */
export function tabLocks(): UsbLocks {
  let queue: Promise<unknown> = Promise.resolve()
  return { request(_name, { signal }, job) {
    let started = false
    const run = queue.then(() => { signal?.throwIfAborted(); started = true; return job({}) })
    queue = run.catch(() => {})
    return !signal ? run : Promise.race([run, new Promise<never>((_, reject) => signal.addEventListener('abort', () => { if (!started) reject(signal.reason) }, { once: true }))])
  } }
}
export const siteLocks = (): UsbLocks => (globalThis.navigator as Navigator & { locks?: UsbLocks } | undefined)?.locks ?? tabLocks()

export function webUsb(): LinkUsb | undefined {
  return typeof navigator !== 'undefined' && globalThis.isSecureContext ? (navigator as Navigator & { usb?: LinkUsb }).usb : undefined
}

export class OctatrackLink {
  private state: LinkState
  private readonly listeners = new Set<() => void>()
  private readonly diagnosticListeners = new Set<(event: LinkDiagnostic) => void>()
  private readonly usb?: LinkUsb | null
  private readonly connectSession: Connect
  private readonly stopWaitMs: number
  private device?: LinkDevice
  private index?: number
  private transport?: UsbVendorTransport
  private session?: LinkSession
  /** Changes in the last load: how long its publication or restore may take (setBudget). */
  private rows = 1
  private abort?: AbortController
  private keepalive?: ReturnType<typeof setInterval>
  private baseStep?: BaseUpdateStep
  /** SLOTS as the unit answered it at connect (undefined from a base before the two slots). */
  private slotsRead?: BaseSlots | null
  private users = 0
  /** Bumped when the unit goes away or the last view leaves: a reply or queued job from before must not change the link. */
  private connection = 0
  /** USB jobs run one at a time across every tab of the site: a read releasing the interface would cut off a load that
   * just claimed it, and two tabs claiming in turn collide. A load holds the lock until it is kept or undone. */
  private readonly locks: UsbLocks
  private serial<T>(job: () => Promise<T>): Promise<T> { return this.locks.request(LOCK, {}, job) }

  /** `usb` defaults to the browser's WebUSB; null stands for a browser without it. */
  constructor(usb: LinkUsb | null | undefined = webUsb(), connectSession: Connect = (transport, base, options) => UploadSession.connect(transport, base, options), stopWaitMs = 3000, locks: UsbLocks = siteLocks()) {
    this.usb = usb; this.connectSession = connectSession; this.stopWaitMs = stopWaitMs; this.locks = locks
    this.state = { status: usb ? 'idle' : 'unsupported' }
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly getState = () => this.state
  readonly subscribeDiagnostics = (listener: (event: LinkDiagnostic) => void) => { this.diagnosticListeners.add(listener); return () => { this.diagnosticListeners.delete(listener) } }
  private diagnostic(event: LinkDiagnostic['event'], fields: Partial<LinkDiagnostic> = {}) {
    if (!this.diagnosticListeners.size) return
    const {identity,active,status} = this.state
    const reading: LinkDiagnostic = {event,phase:status,...(identity ? {base:identity.base} : {}),...(active ? {active} : {}),...fields}
    for (const listener of this.diagnosticListeners) { try { listener(reading) } catch { /* Diagnostics never affect USB work. */ } }
  }
  // Every state carries the base update's step, so the restarts in between (idle, then ready again) keep showing it.
  private set(state: LinkState) { this.state = { ...state, baseUpdate: this.baseStep, slots: this.slotsRead }; for (const listener of this.listeners) listener() }
  private setFor(connection: number, state: LinkState) { if (connection === this.connection) this.set(state) }
  private live(connection: number) { if (connection !== this.connection) throw new DOMException('The Octatrack connection changed.', 'AbortError') }
  private ready(notice?: LinkState['notice'], active = this.state.active) { this.set({ status: 'ready', identity: this.state.identity, active, notice }) }

  /** Listen for the unit coming and going, and reopen one this site was allowed before, without the picker.
   * The card and the install dialog share one link: each view starts it and calls the returned release. */
  start() {
    if (this.users++ === 0 && this.usb) {
      const connection = this.connection
      this.usb.addEventListener('connect', this.onConnect)
      this.usb.addEventListener('disconnect', this.onDisconnect)
      void this.usb.getDevices().then(([device]) => { if (device && connection === this.connection && this.state.status === 'idle') return this.open(device) }).catch(() => {})
    }
    let stopped = false
    return () => { if (!stopped && (stopped = true) && --this.users === 0) this.stop() }
  }
  private stop() {
    this.connection++
    this.usb?.removeEventListener('connect', this.onConnect)
    this.usb?.removeEventListener('disconnect', this.onDisconnect)
    this.stopKeepalive(); this.abort?.abort()
    // Idle ends a trial's hold on the tab lock; the base undoes the trial once USB goes quiet.
    if (this.usb) this.set({ status: 'idle' })
    void this.serial(() => this.release(true))
  }
  /** Chrome's device picker; call from a click. */
  async connect() {
    const connection = this.connection
    let device: LinkDevice
    try { device = await this.usb!.requestDevice({ filters: [{ vendorId: ELEKTRON_VENDOR_ID }] }) } catch { return } // picker closed
    if (connection === this.connection) await this.open(device)
  }
  /** After another tab or app let go of the unit. */
  retry() { const device = this.device; return device ? this.open(device) : this.connect() }
  // An Octatrack restarting after its OS upgrade comes back here, so the install guide's last step completes by itself.
  private readonly onConnect: DeviceListener = ({ device }) => {
    if (['idle', 'stock', 'busy'].includes(this.state.status)) void this.open(device)
  }
  private readonly onDisconnect: DeviceListener = ({ device }) => {
    if (device !== this.device) return
    this.connection++
    const { status, module } = this.state
    this.diagnostic('disconnected')
    this.stopKeepalive(); this.abort?.abort()
    this.device = this.index = this.transport = this.session = this.slotsRead = undefined
    this.set({ status: 'idle', notice: status === 'sending' ? { tone: 'error', text: 'USB disconnected. The Octatrack undoes the unfinished load as soon as playback is stopped.' }
      : status === 'testing' || status === 'trial' ? { tone: 'error', text: `USB disconnected. The Octatrack undoes ${module} by itself as soon as playback is stopped.` }
      : status === 'finishing' ? { tone: 'error', text: 'USB disconnected before Keep or Undo was confirmed. Reconnect to read the Octatrack’s state.' }
      : undefined })
  }

  private open(device: LinkDevice) {
    const connection = this.connection
    return this.serial(async () => { if (connection === this.connection) await this.opening(device) })
  }
  private async opening(device: LinkDevice) {
    const connection = this.connection
    await this.release(true)
    if (connection !== this.connection) return
    this.setFor(connection, { status: 'connecting' })
    this.device = device
    try {
      if (!device.opened) await device.open()
      this.live(connection)
      if (!device.configuration) await device.selectConfiguration(1)
      this.live(connection)
      const index = findVendorInterface(device.configuration)
      if (index === undefined) { await device.close().catch(() => {}); return this.setFor(connection, { status: 'stock' }) }
      this.index = index; this.transport = new UsbVendorTransport(device, index)
      if (!await this.claim()) return
      try {
        const identity = await this.transport.identify()
        this.live(connection)
        const capabilities = await this.transport.capabilities()
        this.live(connection)
        if (capabilities) identity.capabilities = capabilities
        const slots = await this.transport.slots().catch(() => undefined)
        this.live(connection)
        this.slotsRead = slots
        // HELLO is read-only; a base that cannot answer it still counts as ready.
        const session = identity.canSubmit ? await this.connectSession(this.transport, identity.base).catch(() => undefined) : undefined
        this.live(connection)
        // A sync another page left open (closed or reloaded during it): this page holds the lock every page's sync
        // keeps until it is kept or undone, so nobody finishes it. The base would undo it only after 10 s without
        // any USB request, which this page's own reads prevent: undo it now, as the base would have.
        let notice: LinkState['notice']
        if (session && session.status.phase !== 'normal') {
          const staged = session.status.phase !== 'ready', undone = await this.cleanUp(session).catch(() => false)
          this.live(connection)
          notice = !undone ? { tone: 'error', text: UNPLUG } : staged ? { tone: 'success', text: 'The last sync wasn’t finished, so the Octatrack undid it.' } : undefined
        }
        if (!notice && slots?.fellBack) notice = { tone: 'error', text: FELL_BACK }
        this.set({ status: 'ready', identity, active: session?.status.active, notice })
        this.diagnostic('connected')
      }
      catch { this.setFor(connection, { status: 'ready', identity: undefined }) } // a Modwerk base this page does not speak
      finally { await this.release() }
    } catch (error) {
      if (connection !== this.connection) { if (device.opened) await device.close().catch(() => {}); return }
      console.error(error)
      this.device = undefined
      this.set({ status: 'idle', notice: { tone: 'error', text: openFailure() } })
    }
  }
  /** Claimed only while talking, so other tabs and `npm run device` can use the unit in between. */
  private async claim() {
    const connection = this.connection, device = this.device, index = this.index
    if (!device || index === undefined) return false
    try {
      await device.claimInterface(index)
      if (connection !== this.connection) { await device.releaseInterface(index).catch(() => {}); return false }
      return true
    } catch {
      this.setFor(connection, { status: 'busy', identity: this.state.identity })
      setTimeout(() => { if (connection === this.connection && this.state.status === 'busy') void this.retry() }, BUSY_RETRY_MS)
      return false
    }
  }
  private async release(close = false) {
    const device = this.device, index = this.index
    if (device?.opened && index !== undefined) await device.releaseInterface(index).catch(() => {})
    if (close) { this.device = this.index = this.transport = this.session = undefined; if (device?.opened) await device.close().catch(() => {}) }
  }

  /** Stage a whole set on capable bases, then trial it once. Older bases
   * accept a single change; several changes require an updated base. No
   * intermediate acceptance or browser-supplied rollback packages. */
  update(module: string, changes: readonly SetChange[], stressTest?: () => Promise<string | null>) {
    const planned = this.state.active, connection = this.connection // what the changes were prepared against
    // Resolves once the trial runs (or the load failed); the lock stays held until it is kept or undone.
    return new Promise<void>(loaded => { void this.serial(async () => { try { if (connection === this.connection) await this.load(module, changes, stressTest, planned) } finally { loaded() } await this.settled() }) })
  }
  /** Resolves once a load is over (kept, undone, failed or unplugged): until then its tab keeps the lock, so other tabs wait. */
  private settled() {
    return new Promise<void>(resolve => {
      const check = () => { if (!LOADING.includes(this.state.status)) { stop(); resolve() } }
      const stop = this.subscribe(check)
      check()
    })
  }
  private async load(module: string, changes: readonly SetChange[], stressTest?: () => Promise<string | null>, planned?: string | null) {
    const base = this.state.identity?.base, connection = this.connection
    if (!changes.length || this.state.status !== 'ready' || !this.state.identity?.canSubmit || !base || !await this.claim()) return
    const abort = this.abort = new AbortController(), total = changes.reduce((sum, change) => sum + change.data.length, 0)
    this.rows = changes.length
    this.set({ status: 'sending', identity: this.state.identity, active: this.state.active, module, progress: 0 })
    this.diagnostic('sync_started', {packages: changes.map(change => ({sha256:sha(change.data),bytes:change.data.length}))})
    let session: LinkSession | undefined
    try {
      const wholeSet = !!(this.state.identity?.capabilities?.features && this.state.identity.capabilities.features & RuntimeFeature.moduleSets)
      if (changes.length > 1 && !wholeSet) throw new WholeSetBaseRequired()
      session = this.session = await this.connectSession(this.transport!, base)
      this.live(connection); abort.signal.throwIfAborted()
      // Another tab loaded while this one waited for the unit: these changes were planned for what was on it before.
      if (planned && session.status.active && session.status.active !== planned) throw new StaleLoadError()
      if (wholeSet) {
        const baseline = await this.transport!.setIdentity(abort.signal)
        this.live(connection)
        const data = encodeModuleSet(base, baseline, changes.map(change => change.data))
        await this.install(session, data, abort.signal, received => this.set({ ...this.state, progress: received / data.length }), changes.length)
      } else {
        await this.install(session, changes[0].data, abort.signal, received => this.set({ ...this.state, progress: received / total }))
      }
      await session.startTrial()
      this.live(connection)
      this.startKeepalive()
      if (stressTest) {
        this.set({ status: 'testing', identity: this.state.identity, active: session.status.active, module })
        const failure = await stressTest()
        this.live(connection)
        if (failure) throw new StressTestFailure(failure)
      }
      this.set({ status: 'trial', identity: this.state.identity, active: session.status.active, module, tested: !!stressTest })
    } catch (error) {
      if (connection === this.connection) await this.failed(error, session)
    }
  }
  /** Stage and publish one package. shortcut: module files do not name their base yet (as in scripts/device.mjs), so
   * the connected base's loader validates the file; bind the package to its base once module files carry one. */
  private async install(session: LinkSession, data: Uint8Array, signal?: AbortSignal, progress?: (received: number) => void, rows = 1) {
    const connection = this.connection
    if (data.length > session.status.capacity) throw new UploadDeviceError({ ...session.status, result: 'limit' })
    // A publication the loader refused as busy (a resident controller quiescing before it can leave) drops the staged
    // package: stage it again. One refused as playing keeps it: publish it again.
    await this.whenStopped(async () => {
      if (!['verified', 'publishing'].includes(session.status.phase)) await session.stage({ base: session.status.base, data, sha256: sha(data) }, { signal, progress })
      signal?.throwIfAborted() // cancelled, unplugged or left while the last chunk's reply was on its way
      await session.activate(setBudget(rows))
    })
    this.live(connection); signal?.throwIfAborted()
  }
  cancel() { this.abort?.abort() }
  /** The base's self-test, as an update's stress test: null when it passed, else why not; progress while it runs. */
  selftest(onRecord?: (record: SelftestRecord) => void): Promise<string | null> {
    if (!this.transport) return Promise.resolve('the Octatrack isn’t connected')
    return runSelftest(this.transport, { signal: this.abort?.signal, startMs: this.stopWaitMs, progress: (done, total) => this.set({ ...this.state, progress: total ? done / total : 0 }), record: record => { onRecord?.(record); this.diagnostic('selftest', {reading:diagnosticReading(record)}) } })
  }
  /** The base's self-test on its own, from Status (PROJ > MODWERK > SELF TEST over USB): it starts only with the
   * transport stopped and nothing loading. Null when it ran (its record, which Status reads, says how it went), else
   * why it couldn’t run; progress while it runs. */
  test(): Promise<string | null> {
    return this.serial(async () => {
      const { identity, active } = this.state, connection = this.connection
      if (this.state.status !== 'ready' || !identity?.canSubmit) return 'the Octatrack isn’t ready'
      if (!await this.claim()) return 'another app is using the Octatrack'
      this.abort = new AbortController()
      this.set({ status: 'testing', identity, active, progress: 0 })
      let ran = false
      try { const why = await this.selftest(record => { ran = record.state === 2 || record.state === 3 }); return ran ? null : why } catch { return 'the Octatrack stopped answering it' }
      finally { await this.release(); if (connection === this.connection) this.set({ status: 'ready', identity, active }) }
    })
  }
  /** Existing read-only status record; background diagnostics call this only after explicit consent. */
  health(signal?: AbortSignal, allowed: () => boolean = () => true) { return this.read('diagnostic status', transport => transport.selftest(false), signal, allowed).then(record => record ? diagnosticReading(record) : undefined) }
  /** The existing meter windows, without running a self-test or starting DSP work. */
  liveLoad(signal?: AbortSignal, allowed: () => boolean = () => true) { return this.read('load', transport => transport.load(signal), signal, allowed) }
  /** The unit's own diagnostics log (diag.c); background diagnostics call this only after explicit consent. */
  deviceLog(signal?: AbortSignal, allowed: () => boolean = () => true) { return this.read('diagnostics log', transport => transport.deviceLog(signal), signal, allowed) }
  /** Private recovery export: holds one link lock for both fixed saved files, with no card writes. */
  savedBackup(signal?: AbortSignal) { return this.read('saved module files', transport => transport.savedBackup(signal), signal) }
  /** The modules the unit's project names that are not installed, while it is idle ([] from a base without MISSING);
   * undefined when it couldn't ask this round, so a poll keeps what it had. */
  async missing(): Promise<MissingModule[] | undefined> { return this.read('missing modules', transport => transport.missing()).then(list => list ?? [], () => undefined) }
  /** The modules installed on the unit, while it is idle; undefined from a base before INVENTORY (it stalls the request).
   * Rejects with LinkBusyError when it couldn't ask just now. */
  inventory(): Promise<MissingModule[] | undefined> { return this.read('modules', transport => transport.inventory()) }
  /** A read-only request while the unit is idle: WebUSB sends an interface's requests only while it is claimed. It
   * skips the round (LinkBusyError) rather than wait long when another tab or a load holds the unit. */
  private read<T>(what: string, request: (transport: UsbVendorTransport) => Promise<T>, signal?: AbortSignal, allowed: () => boolean = () => true): Promise<T | undefined> {
    const busy = (why: string, cause?: unknown) => {
      const error = new LinkBusyError(`Couldn’t read the Octatrack’s ${what} just now: ${why}.`, { cause })
      if (cause) console.warn(error.message, cause); else console.debug(error.message)
      return error
    }
    const permitted = () => { signal?.throwIfAborted(); if (!allowed()) throw new DOMException('The diagnostic read was cancelled.', 'AbortError') }
    return this.locks.request(LOCK, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(READ_WAIT_MS)]) : AbortSignal.timeout(READ_WAIT_MS) }, async () => {
      permitted()
      if (!this.transport || this.state.status !== 'ready') throw busy('it isn’t idle (' + this.state.status + ')')
      const connection = this.connection
      if (!await this.claim()) throw busy('another app holds it', 'claim failed')
      try { permitted(); const result = await request(this.transport); this.live(connection); return result } catch (error) { throw busy('the transfer failed', error) } finally { await this.release() }
    }).catch(error => { throw error instanceof LinkBusyError ? error : busy('another tab of the site or a load is using it') })
  }
  keep() { return this.finish(true) }
  undo() { return this.finish(false) }

  /** The connected base writes its own container to NOR over USB (flash.c; capability feature bit 8). */
  canUpdateBase() { return ((this.state.identity?.capabilities?.features ?? 0) & RuntimeFeature.baseUpdate) !== 0 }
  /**
   * Update the base over USB, the card being for the first install only. `bin` is the kit's card file (buildBase)
   * and `expected` its identity. First the trial: the new base is staged and RAM-booted, and the unit must come back
   * on it (a power cycle returns to the flashed base when it does not). Then the write: that base, running, is given
   * its own container; it refuses any other base's, writes NOR with stock's OS UPGRADE routines, verifies it and
   * restarts on NOR once accepted. Only a power cut during the write itself needs the card or MIDI recovery.
   * Every base since the beta RAM-boots, so the trial starts from any of them; only the base that writes needs
   * the capability, and it is the new one.
   */
  async updateBase(bin: Uint8Array, expected: string, report: (step: BaseUpdateStep, fraction?: number) => void = () => {}, signal?: AbortSignal) {
    try {
      await this.writeBase(bin, expected, (step, fraction) => {
        const shown = step === 'done' ? undefined : step
        if (shown !== this.baseStep) { this.baseStep = shown; this.set(this.state) }
        report(step, fraction)
      }, signal)
    } finally { if (this.baseStep) { this.baseStep = undefined; this.set(this.state) } }
  }
  private async writeBase(bin: Uint8Array, expected: string, report: (step: BaseUpdateStep, fraction?: number) => void, signal?: AbortSignal) {
    const file = formats.parse(bin, OCTATRACK) as ElekFile, container = file.container, image = file.section(3)
    if (this.state.status !== 'ready' || !this.state.identity?.canSubmit) throw new Error('Connect the Octatrack first.')
    // On two slots the running base writes the new one into its spare slot and the unit restarts once (owner, 25
    // October 2026); a new base that does not start is left by the boot stub after two starts. Otherwise the new base
    // starts from RAM first (the trial) and writes itself, which converts a unit with one copy to the two slots.
    const direct = this.slotsRead?.layout === 'two' && this.canUpdateBase(), late = direct ? NEW_BASE_LATE : UNCONFIRMED
    if (!direct) {
      let current = this.state.identity.base
      const armedFrom: string[] = []
      // Only the flashed base's gate reads the mailbox: armed from a RAM-booted base, the unit comes back on the flashed one, which arms it properly.
      while (current !== expected) {
        if (armedFrom.includes(current)) throw new Error(`The Octatrack came back on base ${current.slice(0, 8)}, not the new one. A power cycle returns to the flashed base.`)
        armedFrom.push(current)
        report('staging', 0)
        const connection = this.connection
        await this.sendBase(current, image, 60000, fraction => report('staging', fraction), signal, session => session.activate().then(() => {}))
        report('starting')
        current = await this.returned(connection, signal)
      }
      report('started')
      if (!this.canUpdateBase()) throw new Error('The new base can’t write itself over USB, so install it from the card. A power cycle returns the Octatrack to its current base.')
    }
    // Once a write may have started, an error is no verdict: a power-off then can leave NOR without a base. The
    // write runs on the unit whatever USB does and a repeat is harmless (flash.c compares NOR first), so the unit is
    // reopened, which rolls back what the lost session left (a verified write then restarts it on NOR), and written again.
    let wrote = false // an activation was sent that may have written NOR
    for (let attempt = 1; ; attempt++) {
      report('writing', 0)
      const connection = this.connection, writer = this.state.identity?.base ?? expected
      try {
        await this.sendBase(writer, container, 180000, fraction => report('writing', fraction), signal, async session => {
          const earlier = wrote
          wrote = true
          await session.activate().catch(async error => {
            const why = await this.writeRefused(error)
            if (why instanceof NothingWritten) wrote = earlier
            // A refusal leaves upload mode; a write that failed its verify stays for another try (flash.c).
            if (error instanceof UploadDeviceError && error.status.result === 'backend') await session.cancel().catch(() => {})
            throw why
          })
          await session.accept()
        })
        // A base that answers SLOTS saved itself while it runs on: the trial was the update's one restart.
        if (!direct && this.slotsRead !== undefined) {
          const slots = await this.read('base slots', transport => transport.slots()).catch(() => undefined)
          if (slots !== undefined) { this.slotsRead = slots; this.set(this.state) }
          return report('done')
        }
        report('restarting')
        const back = await this.returned(connection, signal, 90000, late)
        if (back !== expected) throw new Error(`After the write the Octatrack came back on base ${back.slice(0, 8)}, not the new one.`)
        return report('done')
      } catch (error) {
        if (!wrote || signal?.aborted) throw error
        console.warn('Base write not confirmed, attempt ' + attempt, error)
        if (attempt >= BASE_WRITE_ATTEMPTS) throw new Error(late, { cause: error })
        report('reconnecting')
        const back = await this.steady(connection, signal)
        if (direct && back === expected) return report('done') // it restarted on the new base: the write landed
        // After the trial, back on another base means the unit booted NOR, which still holds that base whole: the
        // write never landed. On two slots it is the base that writes: write again.
        if (!direct && back !== expected) throw new Error(`The Octatrack restarted on its current base (${back.slice(0, 8)}) before the new one was saved, so nothing changed. Try again.`, { cause: error })
      }
    }
  }
  /** A write the running base refused (flash.c, "backend") or could not verify ("needs-recovery"), in words: the
   * self-test record names its reason as 100 + flash.h's flash_refusal. Refusals wrote nothing; a failed verify is
   * written again (writeBase). */
  private async writeRefused(error: unknown) {
    if (!(error instanceof UploadDeviceError) || !['backend', 'needs-recovery'].includes(error.status.result)) return error
    const refusal = (await this.transport?.selftest(false).catch(() => undefined))?.refusal ?? 0
    // 101-106 the container is not this base; 108 flash holds neither one base nor the two slots (flash.h)
    if (refusal > 100 && refusal < 107 || refusal === 108) return new NothingWritten(`The new base refused to write itself (reason ${refusal}), so nothing was written. A power cycle returns the Octatrack to its current base and modules.`, { cause: error })
    return error
  }
  /** The unit reopened after a write step ended without a verdict, once it has stayed connected for a moment: its
   * connect undoes the lost session (cleanUp), which restarts it half a second on when its write had verified. */
  private async steady(connection: number, signal?: AbortSignal) {
    const device = this.device
    if (connection === this.connection && device) { this.connection++; this.set({ status: 'connecting' }); void this.open(device) }
    for (let since = connection; ; ) {
      const base = await this.returned(since, signal, RECONNECT_MS, UNCONFIRMED)
      since = this.connection
      await wait(STEADY_MS)
      signal?.throwIfAborted()
      if (since === this.connection && this.state.status === 'ready') return base
    }
  }
  /** One upload to the idle unit, then `then` on its session: a RAM boot's image, or the container the base writes. */
  private sendBase(base: string, data: Uint8Array, timeoutMs: number, progress: (fraction: number) => void, signal: AbortSignal | undefined, then: (session: LinkSession) => Promise<void>) {
    const connection = this.connection
    return this.serial(async () => {
      this.live(connection)
      if (!this.transport || this.state.status !== 'ready') throw new Error('The Octatrack isn’t idle (' + this.state.status + ').')
      if (!await this.claim()) throw new Error('Another browser window or app is using the Octatrack.')
      try {
        const session = await this.connectSession(this.transport, base, { timeoutMs })
        this.live(connection)
        await this.whenStopped(() => session.stage({ base, data, sha256: sha(data) }, { signal, progress: (done, total) => progress(done / total) }))
        await then(session)
      } finally { await this.release() }
    })
  }
  /** The unit going away (the connection counter moves on) and coming back after a restart: the base it reports then. */
  private returned(connection: number, signal?: AbortSignal, timeoutMs = 90000, late = `The Octatrack did not come back within ${timeoutMs / 1000} s. A power cycle boots its flashed base.`) {
    return new Promise<string>((resolve, reject) => {
      const done = (settle: () => void) => { stop(); clearTimeout(timer); signal?.removeEventListener('abort', aborted); settle() }
      const aborted = () => done(() => reject(new DOMException('The base update was cancelled.', 'AbortError')))
      const timer = setTimeout(() => done(() => reject(new Error(late))), timeoutMs)
      const check = () => {
        const { status, identity } = this.state
        if (this.connection === connection) return
        if (status === 'ready') done(() => identity ? resolve(identity.base) : reject(new Error('The Octatrack came back on a base this page can’t talk to.')))
        else if (status === 'stock') done(() => reject(new Error('The Octatrack came back on the stock OS.')))
      }
      const stop = this.subscribe(check)
      signal?.addEventListener('abort', aborted)
      check()
    })
  }

  private async finish(keep: boolean) {
    const session = this.session, module = this.state.module, connection = this.connection
    if (this.state.status !== 'trial' || !session) return
    this.stopKeepalive()
    this.set({ ...this.state, status: 'finishing', notice: undefined })
    try {
      await this.whenStopped(() => session.holdTrial())
      if (keep) await session.accept()
      else await this.whenStopped(() => session.rollback(), Math.max(this.stopWaitMs, setBudget(this.rows)))
      const unsaved = keep && this.transport && !await waitUntilSaved(this.transport).catch(() => false)
      this.live(connection)
      await session.leaveUploadMode()
      this.live(connection)
      await this.release()
      this.live(connection) // a reply that arrived after the unit went away confirms nothing
      this.ready(unsaved ? { tone: 'error', text: `Kept, but the Octatrack couldn’t save ${module} to the card. It runs until you switch off; load it again to save it.` }
        : { tone: 'success', text: keep ? `Synced. ${module} stays on your Octatrack, also after a restart.` : 'Undone. Your Octatrack is back to how it was.' },
        session.status.active)
      this.diagnostic(keep && !unsaved ? 'kept' : !keep ? 'undone' : 'sync_failed', unsaved ? {error:'save'} : {})
    } catch (error) {
      if (connection !== this.connection) return
      // Playing blocks the stop that keep and undo need; the trial carries on until the user stops.
      if (unsafe(error) && session.connectionTrusted && session.status.phase === 'trial') {
        this.startKeepalive()
        return this.set({ ...this.state, status: 'trial', notice: { tone: 'error', text: explainLinkError(error) } })
      }
      await this.failed(error, session)
    }
  }

  /** Undo what this session left behind. When a reply went missing (the session no longer trusts its
   * connection), a fresh session reads where the base stands and undoes it from there; only when that fails
   * too does the user get the unplug advice. */
  private async failed(error: unknown, session?: LinkSession) {
    const connection = this.connection
    if (!(error instanceof UploadDeviceError) && !(error instanceof DOMException) && !(error instanceof StressTestFailure) && !(error instanceof StaleLoadError) && !(error instanceof WholeSetBaseRequired)) console.error(error)
    this.stopKeepalive()
    let clean = !session, settled = session?.connectionTrusted ? session : undefined, recovered = false
    if (session && !session.connectionTrusted && error instanceof UploadUnconfirmedError && this.transport && this.state.identity?.base) {
      try { settled = await this.connectSession(this.transport, this.state.identity.base); recovered = true } catch { settled = undefined }
    }
    if (settled) {
      try { clean = await this.cleanUp(settled) } catch { clean = false }
    }
    if (connection !== this.connection) return
    const why = error instanceof UploadDeviceError && ['rejected', 'backend'].includes(error.status.result) ?
      (await this.transport?.selftest(false).catch(() => undefined))?.refusal : undefined
    if (connection !== this.connection) return
    const label = error instanceof UploadDeviceError ? 'device' : error instanceof StressTestFailure ? 'selftest' : error instanceof UploadUnconfirmedError ? 'transport' : error instanceof StaleLoadError ? 'stale' : error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'unknown'
    // An unclassified failure names its error type (never the message), so the diagnostics can tell a bug from a refusal.
    this.diagnostic('sync_failed', {error: label, ...(label === 'unknown' ? {kind: diagnosticErrorKind(error)} : {}), ...(error instanceof UploadDeviceError && error.status.result !== 'progress' ? {result:error.status.result} : {}), ...(why !== undefined ? {refusal:why} : {})})
    this.session = undefined
    await this.release()
    // An untrusted connection that could not be read again leaves the running set unknown.
    const text = recovered && clean ? RECOVERED : (REJECTED[why ?? 0] ?? explainLinkError(error)) + (clean ? '' : ' ' + UNPLUG)
    if (this.device && connection === this.connection) this.ready({ tone: 'error', text }, session ? settled?.status.active : this.state.active)
  }
  /** Cancel, roll back or leave upload mode from whatever phase `session` reports; true once back to normal. */
  private async cleanUp(session: LinkSession) {
    const phase = session.status.phase
    if (phase === 'receiving' || phase === 'verified') { session.adopt(); await session.cancel() } // a fresh session adopts what the lost one staged
    else if (phase === 'pending' || phase === 'trial' || phase === 'recovery' || phase === 'publishing') { session.adopt(); await this.whenStopped(() => session.rollback(), Math.max(this.stopWaitMs, setBudget(this.rows))); await session.leaveUploadMode() }
    else if (phase === 'ready') await session.leaveUploadMode()
    return session.status.phase === 'normal'
  }
  /** Repeat a step the base refused only because the unit plays or records, or because its loader was busy for a
   * moment (refusal 5: DSP code loading or moving), for `stopWaitMs`. A rollback the loader could not switch yet (an
   * effect's code still being published just after it went in, emulator 12 October 2026) leaves the controller in
   * recovery, from where it rolls back again. */
  private async whenStopped<T>(step: () => Promise<T>, waitMs = this.stopWaitMs): Promise<T> {
    const connection = this.connection
    for (const start = Date.now(); ; await wait(STOP_RETRY_MS)) {
      this.live(connection)
      try { const result = await step(); this.live(connection); return result } catch (error) {
        const recovery = error instanceof UploadDeviceError && error.status.result === 'needs-recovery'
        if (Date.now() - start >= waitMs || !(unsafe(error) || recovery || await this.loaderBusy(error))) throw error
      }
    }
  }
  private async loaderBusy(error: unknown) {
    return error instanceof UploadDeviceError && ['rejected', 'backend'].includes(error.status.result) &&
      (await this.transport?.selftest(false).catch(() => undefined))?.refusal === 5
  }
  private startKeepalive() {
    this.stopKeepalive()
    this.keepalive = setInterval(() => { void this.transport?.identify().catch(() => {}) }, KEEPALIVE_MS)
  }
  private stopKeepalive() { clearInterval(this.keepalive); this.keepalive = undefined }
}
