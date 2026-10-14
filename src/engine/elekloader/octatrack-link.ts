// SPDX-License-Identifier: GPL-3.0-or-later
// The site's USB link to an Octatrack running the Modwerk base: find the unit,
// send a module set's runtime packages, run the last as a trial, then keep or
// undo it. The base itself undoes anything not kept when USB goes quiet or away,
// so every failure here ends in "unplug to undo" at worst.
import { runSelftest, waitUntilSaved } from './selftest.ts'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { UploadDeviceError, UploadSession, UploadUnconfirmedError } from './upload-session.ts'
import type { UploadResultName } from './upload-wire.ts'
import { findVendorInterface, UsbVendorTransport, type ControlDevice, type MissingModule, type SelftestRecord, type VendorIdentity } from './upload-usb.ts'
import type { OctatrackDiagnostic, DiagnosticReading } from '../../community/octatrack-diagnostics-contract'

export type LinkDiagnostic = Omit<OctatrackDiagnostic, 'id' | 'modules'>
/** Numeric status fields only; exclude the device's free-text culprit name. */
export function diagnosticReading(record: SelftestRecord): DiagnosticReading {
  const {state,failed,modules,dsp,intact,ran,frameGap,saved,savedCount,live,culprit,refusal,peaks} = record
  return {state,failed,modules,dsp,intact,ran,frameGap,saved,savedCount,live,culprit,refusal,cpu:peaks.cpu,tracks1to4:peaks.tracks1to4,tracks5to8:peaks.tracks5to8}
}

export const ELEKTRON_VENDOR_ID = 0x1935
/** Well inside the base's 10 s quiet limit (sdk/runtime/upload/vendor.c mv_tick); any vendor request counts. */
const KEEPALIVE_MS = 1000
/** Asked while playing, the base presses STOP itself and answers `unsafe` that once; ask again until it has stopped. */
const STOP_RETRY_MS = 200
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
type Connect = (transport: UsbVendorTransport, base: string) => Promise<LinkSession>

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
}
const UNPLUG = 'Unplug the USB cable to undo anything unfinished, then plug it back in.'
const RECOVERED = 'The Octatrack missed a reply, so nothing changed. Try again.'
const BETWEEN = 'Your Octatrack is between the two module sets: sync one of them again.'
const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items)
const notPutBack = (lost: string[]) => `${list(lost)} couldn’t be put back: the site has no package for ${lost.length === 1 ? 'it' : 'them'}.`

/** A stress test found a problem; its reason is shown to the user. */
export class StressTestFailure extends Error {}
/** The unit changed between planning a load and sending it (another tab loaded first). */
export class StaleLoadError extends Error {}

/** What a failed step means for the user, in their words. */
export function explainLinkError(error: unknown): string {
  if (error instanceof StressTestFailure) return `The self-test failed: ${error.message}. Nothing was kept.`
  if (error instanceof StaleLoadError) return 'Another tab changed your Octatrack meanwhile, so nothing was synced. Review the sync again.'
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
const LOCK = 'modwerk-octatrack-usb', READ_WAIT_MS = 1000
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
const siteLocks = (): UsbLocks => (globalThis.navigator as Navigator & { locks?: UsbLocks } | undefined)?.locks ?? tabLocks()

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
  private abort?: AbortController
  private keepalive?: ReturnType<typeof setInterval>
  private users = 0
  /** Bumped when the unit goes away or the last view leaves: a reply or queued job from before must not change the link. */
  private connection = 0
  /** The changes of the load in progress already kept on the unit, and the one being sent (of a set of several). */
  private kept: SetChange[] = []
  private current?: string
  /** USB jobs run one at a time across every tab of the site: a read releasing the interface would cut off a load that
   * just claimed it, and two tabs claiming in turn collide. A load holds the lock until it is kept or undone. */
  private readonly locks: UsbLocks
  private serial<T>(job: () => Promise<T>): Promise<T> { return this.locks.request(LOCK, {}, job) }

  /** `usb` defaults to the browser's WebUSB; null stands for a browser without it. */
  constructor(usb: LinkUsb | null | undefined = webUsb(), connectSession: Connect = (transport, base) => UploadSession.connect(transport, base), stopWaitMs = 3000, locks: UsbLocks = siteLocks()) {
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
  private set(state: LinkState) { this.state = state; for (const listener of this.listeners) listener() }
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
    const { status, module } = this.state, between = this.kept.length > 0
    this.diagnostic('disconnected')
    this.stopKeepalive(); this.abort?.abort()
    this.device = this.index = this.transport = this.session = undefined
    this.kept = []
    this.set({ status: 'idle', notice: between && status !== 'idle' ? { tone: 'error', text: 'USB disconnected. ' + BETWEEN }
      : status === 'sending' ? { tone: 'error', text: 'USB disconnected. Nothing changed on the Octatrack.' }
      : status === 'testing' || status === 'trial' || status === 'finishing' ? { tone: 'error', text: `USB disconnected. The Octatrack undoes ${module} by itself as soon as playback is stopped.` }
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
        // HELLO is read-only; a base that cannot answer it still counts as ready.
        const active = identity.canSubmit ? await this.connectSession(this.transport, identity.base).then(s => s.status.active, () => undefined) : undefined
        this.live(connection)
        this.set({ status: 'ready', identity, active })
        this.diagnostic('connected')
      }
      catch { this.setFor(connection, { status: 'ready', identity: undefined }) } // a Modwerk base this page does not speak
      finally { await this.release() }
    } catch (error) {
      if (connection !== this.connection) { if (device.opened) await device.close().catch(() => {}); return }
      console.error(error)
      this.device = undefined
      this.set({ status: 'idle', notice: { tone: 'error', text: 'Chrome couldn’t open the Octatrack. Unplug it, plug it back in and try again.' } })
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
      return false
    }
  }
  private async release(close = false) {
    const device = this.device, index = this.index
    if (device?.opened && index !== undefined) await device.releaseInterface(index).catch(() => {})
    if (close) { this.device = this.index = this.transport = this.session = undefined; if (device?.opened) await device.close().catch(() => {}) }
  }

  /** Load a module set's changes (`module` names the set) and start the trial of the last one. With `stressTest`,
   * the unit is tested first (null means passed) and a failure undoes the load. The base runs one transaction at a
   * time, so each change before the last is kept as soon as it is in; undoing the load (Undo, a failed stress test,
   * a refusal part way) rolls back the trial, then sends those changes' undo packages, newest first. */
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
    this.kept = []
    this.set({ status: 'sending', identity: this.state.identity, active: this.state.active, module, progress: 0 })
    this.diagnostic('sync_started', {packages: changes.map(change => ({sha256:sha(change.data),bytes:change.data.length}))})
    let session: LinkSession | undefined, sent = 0
    try {
      session = this.session = await this.connectSession(this.transport!, base)
      this.live(connection); abort.signal.throwIfAborted()
      // Another tab loaded while this one waited for the unit: these changes were planned for what was on it before.
      if (planned && session.status.active && session.status.active !== planned) throw new StaleLoadError()
      for (const [i, change] of changes.entries()) {
        this.current = changes.length > 1 ? change.module : undefined
        await this.install(session, change.data, abort.signal, received => this.set({ ...this.state, progress: (sent + received) / total }))
        this.live(connection)
        sent += change.data.length
        if (i < changes.length - 1) { await session.accept(); this.live(connection); this.kept.push(change) }
      }
      this.current = undefined
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
  private async install(session: LinkSession, data: Uint8Array, signal?: AbortSignal, progress?: (received: number) => void) {
    const connection = this.connection
    if (data.length > session.status.capacity) throw new UploadDeviceError({ ...session.status, result: 'limit' })
    // A publication the loader refused as busy (a resident controller quiescing before it can leave) drops the staged
    // package: stage it again. One refused as playing keeps it: publish it again.
    await this.whenStopped(async () => {
      if (session.status.phase !== 'verified') await session.stage({ base: session.status.base, data, sha256: sha(data) }, { signal, progress })
      signal?.throwIfAborted() // cancelled, unplugged or left while the last chunk's reply was on its way
      await session.activate()
    })
    this.live(connection); signal?.throwIfAborted()
  }
  /** Put back what the load's kept changes did, newest first, each kept at once; the modules it had no package for. */
  private async revert(session: LinkSession) {
    const lost: string[] = []
    for (let change; (change = this.kept.at(-1)); this.kept.pop()) {
      if (!change.undo) { lost.push(change.module); continue }
      await this.install(session, change.undo)
      await session.accept()
    }
    return lost
  }
  cancel() { this.abort?.abort() }
  /** The base's self-test, as an update's stress test: null when it passed, else why not; progress while it runs. */
  selftest(): Promise<string | null> {
    if (!this.transport) return Promise.resolve('the Octatrack isn’t connected')
    return runSelftest(this.transport, { signal: this.abort?.signal, startMs: this.stopWaitMs, progress: (done, total) => this.set({ ...this.state, progress: total ? done / total : 0 }), record: record => this.diagnostic('selftest', {reading:diagnosticReading(record)}) })
  }
  /** Existing read-only status record; background diagnostics call this only after explicit consent. */
  health(signal?: AbortSignal, allowed: () => boolean = () => true) { return this.read('diagnostic status', transport => transport.selftest(false), signal, allowed).then(record => record ? diagnosticReading(record) : undefined) }
  /** The existing meter windows, without running a self-test or starting DSP work. */
  liveLoad(signal?: AbortSignal, allowed: () => boolean = () => true) { return this.read('load', transport => transport.load(signal), signal, allowed) }
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

  private async finish(keep: boolean) {
    const session = this.session, module = this.state.module, connection = this.connection
    if (this.state.status !== 'trial' || !session) return
    this.stopKeepalive()
    this.set({ ...this.state, status: 'finishing', notice: undefined })
    try {
      await this.whenStopped(() => session.holdTrial())
      let lost: string[] = []
      if (keep) { await session.accept(); this.live(connection); this.kept = [] } else { await this.whenStopped(() => session.rollback()); lost = await this.revert(session) }
      const unsaved = keep && this.transport && !await waitUntilSaved(this.transport).catch(() => false)
      this.live(connection)
      await session.leaveUploadMode()
      this.live(connection)
      await this.release()
      this.live(connection) // a reply that arrived after the unit went away confirms nothing
      this.ready(unsaved ? { tone: 'error', text: `Kept, but the Octatrack couldn’t save ${module} to the card. It runs until you switch off; load it again to save it.` }
        : lost.length ? { tone: 'error', text: 'Undone, except: ' + notPutBack(lost) }
        : { tone: 'success', text: keep ? `Kept. ${module} stays on your Octatrack, also after a restart.` : 'Undone. Your Octatrack is back to how it was.' },
        session.status.active)
      this.diagnostic(keep && !unsaved ? 'kept' : !keep && !lost.length ? 'undone' : 'sync_failed', {...(unsaved ? {error:'save' as const} : lost.length ? {error:'rollback' as const} : {})})
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
    if (!(error instanceof UploadDeviceError) && !(error instanceof DOMException) && !(error instanceof StressTestFailure) && !(error instanceof StaleLoadError)) console.error(error)
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
    this.diagnostic('sync_failed', {error: error instanceof UploadDeviceError ? 'device' : error instanceof StressTestFailure ? 'selftest' : error instanceof UploadUnconfirmedError ? 'transport' : error instanceof StaleLoadError ? 'stale' : error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'unknown', ...(error instanceof UploadDeviceError ? {result:error.status.result} : {}), ...(why !== undefined ? {refusal:why} : {})})
    // A set's changes kept before the failure are undone too, once the base is back to normal.
    let lost: string[] = [], between = false
    if (this.kept.length) {
      try { if (!clean || !settled) throw new Error('unsettled'); lost = await this.revert(settled); await settled.leaveUploadMode() } catch { between = true }
    }
    if (connection !== this.connection) return
    const failing = this.current
    this.session = this.current = undefined
    this.kept = []
    await this.release()
    // An untrusted connection that could not be read again leaves the running set unknown.
    const text = (failing ? failing + ': ' : '') + (recovered && clean ? RECOVERED : (REJECTED[why ?? 0] ?? explainLinkError(error)) + (clean ? '' : ' ' + UNPLUG)) +
      (between ? ' ' + BETWEEN : lost.length ? ' ' + notPutBack(lost) : '')
    if (this.device && connection === this.connection) this.ready({ tone: 'error', text }, session ? settled?.status.active : this.state.active)
  }
  /** Cancel, roll back or leave upload mode from whatever phase `session` reports; true once back to normal. */
  private async cleanUp(session: LinkSession) {
    const phase = session.status.phase
    if (phase === 'receiving' || phase === 'verified') { session.adopt(); await session.cancel() } // a fresh session adopts what the lost one staged
    else if (phase === 'pending' || phase === 'trial' || phase === 'recovery') { await this.whenStopped(() => session.rollback()); await session.leaveUploadMode() }
    else if (phase === 'ready') await session.leaveUploadMode()
    return session.status.phase === 'normal'
  }
  /** Repeat a step the base refused only because the unit plays or records, or because its loader was busy for a
   * moment (refusal 5: DSP code loading or moving), for `stopWaitMs`. A rollback the loader could not switch yet (an
   * effect's code still being published just after it went in, emulator 12 October 2026) leaves the controller in
   * recovery, from where it rolls back again. */
  private async whenStopped<T>(step: () => Promise<T>): Promise<T> {
    const connection = this.connection
    for (const start = Date.now(); ; await wait(STOP_RETRY_MS)) {
      this.live(connection)
      try { const result = await step(); this.live(connection); return result } catch (error) {
        const recovery = error instanceof UploadDeviceError && error.status.result === 'needs-recovery'
        if (Date.now() - start >= this.stopWaitMs || !(unsafe(error) || recovery || await this.loaderBusy(error))) throw error
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
