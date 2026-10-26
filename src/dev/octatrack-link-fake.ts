// SPDX-License-Identifier: GPL-3.0-or-later
// A pretend Octatrack for the link's tests and the dev previews
// (`?preview=usb-link`, `?preview=base-install`): enumerates like the base, answers IDENTIFY with
// real bytes, and runs the upload session's phases with no device behind them.
import type { Inventory, InventoryTarget } from '../config/inventory.ts'
import { sha } from '../../vendor/elekloader/kit/src/bytes.ts'
import { depackSection } from '../../vendor/elekloader/kit/src/codec/elz.ts'
import { OctatrackLink, type LinkDevice, type LinkSession, type LinkUsb } from '../engine/elekloader/octatrack-link.ts'
import { UPLOAD_TIMEOUT_MAX_MS, UploadDeviceError, UploadUnconfirmedError } from '../engine/elekloader/upload-session.ts'
import { SELFTEST_BYTES, VENDOR_CLASS, VENDOR_PROTOCOL, VENDOR_SUBCLASS } from '../engine/elekloader/upload-usb.ts'
import type { UploadPhaseName, UploadResultName, UploadStatus } from '../engine/elekloader/upload-wire.ts'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }

/** The published base, so the pretend unit is a tester who is up to date (older bases are told to update). */
export const FAKE_BASE: string = baseBinding.identity
const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
/** IDENTIFY as sdk/runtime/upload/vendor.c sends it: version 1, can submit, limits, base, model. */
const identityBytes = (base: string) => Uint8Array.from([...ascii('MWUI'), 1, 1, 0, 1, 0x10, 0x34, 0, 0x98, 0, 0, 0, 0,
  ...Array.from({ length: 32 }, (_, i) => parseInt(base.slice(2 * i, 2 * i + 2), 16)), ...ascii('OCTATRACK MKII'), 0, 0, ...new Array(8).fill(0)])
/** The base a RAM boot image stands for here: its hash (a real base's identity is its build's). */
export const fakeBaseOf = (image: Uint8Array) => sha(image)

type Listener = (event: { device: LinkDevice }) => void
export interface FakeUnit {
  usb: LinkUsb
  plug(kind?: 'base' | 'stock'): void
  unplug(): void
  /** Another tab or app holds the interface. */
  taken: boolean
  playing: boolean
  /** The kept set's digest; the base's own while nothing is loaded. */
  active: string
  /** The base the unit runs (IDENTIFY), and the one in its NOR: a RAM boot changes the first, a USB base update both. */
  base: string
  flashed: string
  /** The base writes its own container to NOR over USB (capability feature bit 8, flash.c). */
  updatesBase: boolean
  /** Whole-set transaction capability (512), opt in in lifecycle tests. */
  moduleSets: boolean
  /** What the unit has, and what a staged load would make it (taken on Keep). */
  installed: Inventory
  pending?: Inventory
  /** Project references for the missing-module preview; resolved modules disappear after Keep. */
  project?: { id: string; name: string }[]
  /** A transaction a session left staged when its reply went missing: only a session that adopts it can cancel it. */
  staged?: boolean
  /** A published candidate whose page closed during its trial (its digest): only a session that adopts it can roll it back. */
  orphan?: string
  /** Previews only: a passed self-test with the set saved on the card, and live meters (requests 21 and 30). */
  status?: boolean
  /** The loader refuses the next load with this reason (loader.h runtime_refusal), as the base's record reports it. */
  refusal?: number
  /** The loader refuses the next publications with this reason, after staging (a resident controller quiescing: 5);
   * the base then drops the staged package. */
  publishRefusal?: number
  /** The running base refuses to write its own container with this reason (flash.h flash_refusal); its record reports
   * 100 + it, as dsp.c does. */
  writeRefusal?: number
  /** Writes of its own container that fail their verify (flash.h FLASH_WRITE, record 107): NOR is left without a
   * base ('') and the unit stays up from RAM for another try. */
  writeFails?: number
  /** Writes during which USB drops: the write finishes on the unit, the reply is lost, and the replugged unit's
   * reset rolls the lost session back, which restarts it on NOR (flash.c f_restore). */
  writeDropouts?: number
  /** SLOTS (request 39, flash.h): the base's two-slot record; absent, the base stalls it as one before the two slots.
   * A base that answers it writes another base's container into its spare slot and restarts once onto it, and its own
   * (after the trial) while it runs on, without a restart (flash.c); one that does not restarts after writing itself. */
  slots?: Uint8Array
  /** Rollbacks the loader cannot switch yet (an effect's code still being published): the controller stays in recovery. */
  stuck?: number
  /** The runtime ids (hex) of the modules the kept runtime packages installed, as INVENTORY lists them, and each kept
   * package in order: + installed, - removed. */
  modules: string[]
  kept: string[]
}

export function fakeUnit(kind: 'base' | 'stock' | 'none' = 'base'): FakeUnit {
  const listeners = { connect: new Set<Listener>(), disconnect: new Set<Listener>() }
  const make = (base: boolean): LinkDevice => {
    const alternates = (interfaceClass: number, interfaceSubclass: number, interfaceProtocol: number, endpoints: unknown[] = []) =>
      [{ interfaceClass, interfaceSubclass, interfaceProtocol, endpoints }]
    const interfaces = [{ interfaceNumber: 0, alternates: alternates(8, 6, 0x50, [1, 2]) },
      ...base ? [{ interfaceNumber: 5, alternates: alternates(VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL) }] : []]
    const device = {
      opened: false, configuration: { interfaces },
      async open() { device.opened = true }, async close() { device.opened = false },
      async selectConfiguration() {},
      async claimInterface() { if (unit.taken) throw new DOMException('Unable to claim interface.', 'NetworkError') },
      async releaseInterface() {},
      async controlTransferOut() { return { status: 'stall', bytesWritten: 0 } },
      async controlTransferIn(setup: { request: number; value: number }) {
        if (setup.request === 3) return { status: 'ok', data: new DataView(identityBytes(unit.base).buffer) }
        if (setup.request === 29) { // CAPABILITIES, MWCP v1: loader ABI 8, the feature bits, 24 sites, 8 copies
          const caps = new DataView(new ArrayBuffer(12)); caps.setUint32(0, 0x4d574350); caps.setUint8(4, 1); caps.setUint8(5, 8)
          caps.setUint16(6, 128 | (unit.updatesBase ? 256 : 0) | (unit.moduleSets ? 512 : 0)); caps.setUint16(8, 24); caps.setUint16(10, 8)
          return { status: 'ok', data: caps }
        }
        if (setup.request === 38 && unit.moduleSets) {
          const bytes = new Uint8Array(40), view = new DataView(bytes.buffer)
          view.setUint32(0, 0x4d575344); view.setUint8(4, 1); view.setUint8(5, 1); view.setUint16(6, unit.modules.length)
          const digest = sha(new TextEncoder().encode(JSON.stringify([...unit.modules].sort())))
          bytes.set(Uint8Array.from({ length: 32 }, (_, i) => parseInt(digest.slice(2 * i, 2 * i + 2), 16)), 8)
          return { status: 'ok', data: view }
        }
        if (setup.request === 14 && unit.project) {
          const page = unit.project.filter(item => !unit.installed.moduleIds.includes(item.id)).slice(setup.value, setup.value + 13)
          const data = new Uint8Array(4 + 24 * page.length), view = new DataView(data.buffer)
          data.set([0x4d, 0x57, 0x4d, page.length])
          page.forEach((item, i) => {
            view.setUint32(8 + 24 * i, Number.parseInt(sha(new TextEncoder().encode(item.id)).slice(0, 8), 16))
            data.set(new TextEncoder().encode(item.name).subarray(0, 16), 12 + 24 * i)
          })
          return { status: 'ok', data: view }
        }
        if (setup.request === 39 && unit.slots) return { status: 'ok', data: new DataView(unit.slots.slice().buffer) }
        if (setup.request === 27) { // INVENTORY, 13 a page from wValue: no DSP code, no name
          const page = unit.modules.slice(setup.value, setup.value + 13), list = new DataView(new ArrayBuffer(4 + 24 * page.length))
          ;[0x4d, 0x57, 0x49, page.length].forEach((byte, i) => list.setUint8(i, byte))
          page.forEach((id, i) => { list.setUint8(4 + 24 * i, 0xff); list.setUint32(8 + 24 * i, Number.parseInt(id, 16)) })
          return { status: 'ok', data: list }
        }
        if (setup.request === 30 && unit.status) { // MWLD v1: CPU, tracks 5-8 and its peak, tracks 1-4 and its peak, per mille
          const load = new DataView(new ArrayBuffer(48)), ticks = Math.floor(Date.now() / 20) >>> 0, wave = (phase: number) => Math.round(80 * Math.sin(Date.now() / 9000 + phase))
          load.setUint32(0, 0x4d574c44); load.setUint8(4, 1); load.setUint8(5, 7); load.setUint16(6, 48); load.setUint32(8, ticks); load.setUint32(12, ticks * 3)
          ;[16, 20, 24].forEach(offset => load.setUint32(offset, ticks))
          ;[380 + wave(0), 520 + wave(2), 640, 260 + wave(4), 410].forEach((value, i) => load.setUint32(28 + 4 * i, value))
          return { status: 'ok', data: load }
        }
        const refusal = unit.refusal ?? unit.publishRefusal ?? (unit.writeRefusal ? 100 + unit.writeRefusal : unit.flashed === '' ? 107 : undefined)
        if (setup.request === 21 && unit.status && refusal === undefined) { // passed, peaks, saved on the card and read back
          const record = new DataView(new ArrayBuffer(SELFTEST_BYTES)), count = unit.installed.moduleIds.length
          ;[[0, 2], [3, count], [7, 410], [8, 655], [9, 470], [14, 47900], [15, 7], [16, count], [17, count]].forEach(([at, value]) => record.setUint32(4 * at, value))
          return { status: 'ok', data: record }
        }
        if (setup.request !== 21 || refusal === undefined) return { status: 'stall' }
        const record = new DataView(new ArrayBuffer(SELFTEST_BYTES)) // the base's record, idle, with its last refusal
        record.setUint32(92, refusal)
        return { status: 'ok', data: record }
      },
    }
    return device
  }
  let device: LinkDevice | undefined = kind === 'none' ? undefined : make(kind === 'base')
  const unit: FakeUnit = {
    taken: false, playing: false, installed: { moduleIds: [], removedStockFx: [] }, active: FAKE_BASE, modules: [], kept: [],
    base: FAKE_BASE, flashed: FAKE_BASE, updatesBase: true, moduleSets: false,
    usb: {
      async requestDevice() { if (!device) throw new DOMException('No device selected.', 'NotFoundError'); return device },
      async getDevices() { return device ? [device] : [] },
      addEventListener(type, listener) { listeners[type].add(listener) },
      removeEventListener(type, listener) { listeners[type].delete(listener) },
    },
    plug(next = 'base') { device = make(next === 'base'); for (const listener of listeners.connect) listener({ device }) },
    unplug() { const gone = device; device = undefined; if (gone) for (const listener of listeners.disconnect) listener({ device: gone }) },
  }
  return unit
}

/** The upload session's phases without frames. `delay` paces each step for the preview; tests use 0. */
export function fakeSession(unit: FakeUnit, delay = 0) {
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  return async (_transport?: unknown, _base?: string, options: { timeoutMs?: number } = {}): Promise<LinkSession> => {
    if ((options.timeoutMs ?? 0) > UPLOAD_TIMEOUT_MAX_MS) throw new Error('Upload timeout must be at most ' + UPLOAD_TIMEOUT_MAX_MS + ' ms.') // as UploadSession.connect
    let status: UploadStatus = { command: 'hello', transaction: 0, result: 'ok', phase: unit.staged ? 'receiving' : unit.orphan ? 'trial' : 'normal', activeKnown: true, generation: unit.orphan ? 1 : 0,
      lastTransaction: unit.orphan ? 7 : 0, currentTransaction: unit.orphan ? 7 : 0, received: 0, capacity: 262144, base: unit.base, session: '00'.repeat(32),
      active: unit.orphan ?? unit.active }
    let staged = unit.active, owned = false, data: Uint8Array | undefined
    // The base a staged container holds: its section's image. A base before the two slots writes only itself.
    const written = () => unit.slots ? fakeBaseOf(depackSection(data!.subarray(0x12))) : unit.base
    const step = async (phase: UploadPhaseName, refuse?: UploadResultName) => {
      await wait()
      if (refuse) throw new UploadDeviceError(status = { ...status, result: refuse })
      status = { ...status, phase, result: 'ok' }
      return status
    }
    await wait()
    return {
      get status() { return status }, connectionTrusted: true,
      async stage(pkg, { signal, progress } = {}) {
        if (unit.playing) return step('normal', 'unsafe')
        if (unit.refusal) return step('normal', 'rejected')
        staged = pkg.sha256; data = pkg.data
        for (let sent = 0; sent < pkg.data.length;) {
          if (signal?.aborted) { status = { ...status, phase: 'normal' }; throw new DOMException('Module staging cancelled.', 'AbortError') }
          await wait()
          sent = Math.min(pkg.data.length, sent + 4096); progress?.(sent, pkg.data.length)
        }
        return step('verified')
      },
      activate: async () => {
        const container = !!data && String.fromCharCode(...data.subarray(0, 4)) === 'ELEK'
        if (unit.publishRefusal || container && unit.writeRefusal) { await wait(); throw new UploadDeviceError(status = { ...status, phase: 'ready', result: 'backend' }) } // the package dropped
        if (container && unit.writeFails && unit.writeFails-- > 0) { unit.flashed = ''; await wait(); throw new UploadDeviceError(status = { ...status, phase: 'recovery', result: 'needs-recovery', activeKnown: false }) }
        if (container && unit.writeDropouts && unit.writeDropouts-- > 0) {
          const target = written(), restarts = !unit.slots || target !== unit.base
          unit.flashed = target; unit.unplug()
          setTimeout(() => { unit.plug('base'); if (restarts) setTimeout(() => { unit.base = unit.active = target; unit.unplug(); unit.plug('base') }, delay + 500) }, delay + 100)
          throw new UploadUnconfirmedError('The activation reply was lost.', status)
        }
        const published = await step('pending')
        // A RAM boot image (boot.c): the unit restarts half a second on. Only the flashed base's gate reads the mailbox, so
        // armed from a base running out of RAM it comes back on the flashed one; from that one, on the image's base.
        if (data && data.length >= 4 && new DataView(data.buffer, data.byteOffset).getUint32(0) === 0x4fefffe4) {
          const next = unit.base === unit.flashed ? fakeBaseOf(data) : unit.flashed
          setTimeout(() => { unit.base = unit.active = next; unit.unplug(); unit.plug('base') }, delay)
        }
        return published
      },
      startTrial: async () => status = { ...await step('trial'), active: staged },
      holdTrial: () => step('pending', unit.playing ? 'unsafe' : undefined),
      accept: async () => {
        await step('ready'); unit.active = status.active!; unit.installed = unit.pending ?? unit.installed; unit.pending = undefined
        if (data && String.fromCharCode(...data.subarray(0, 4)) === 'ELEK') { // a base written to NOR (flash.c)
          const target = written()
          unit.flashed = target
          if (unit.slots) { unit.slots = unit.slots.slice(); unit.slots[4] = 1 } // two slots now
          if (!unit.slots || target !== unit.base) setTimeout(() => { unit.base = unit.active = target; unit.unplug(); unit.plug('base') }, delay)
          return status
        }
        const apply = (pkg: Uint8Array) => {
          const view = new DataView(pkg.buffer, pkg.byteOffset), id = view.getUint32(28).toString(16).padStart(8, '0')
          const removes = !view.getUint32(8) && !view.getUint32(20) && !view.getUint32(24) && (view.getUint16(4) < 5 || !view.getUint32(32))
          unit.modules = unit.modules.filter(item => item !== id).concat(removes ? [] : [id]); unit.kept.push((removes ? '-' : '+') + id)
        }
        if (data && String.fromCharCode(...data.subarray(0, 4)) === 'MWRM') apply(data)
        else if (data && String.fromCharCode(...data.subarray(0, 4)) === 'MWMS') {
          const view = new DataView(data.buffer, data.byteOffset)
          for (let i = 0, at = 80; i < view.getUint16(6); i++) {
            const length = view.getUint32(at); apply(data.subarray(at + 4, at + 4 + length)); at += 4 + Math.ceil(length / 4) * 4
          }
        }
        return status
      },
      rollback: async () => {
        if (unit.stuck && unit.stuck-- > 0) return step('recovery', 'needs-recovery')
        if (unit.orphan && !owned) throw new Error('This client does not own a staged transaction.')
        unit.orphan = undefined; unit.pending = undefined; return status = { ...await step('ready'), active: unit.active }
      },
      adopt: () => owned ||= ['receiving', 'pending', 'trial', 'recovery', 'publishing'].includes(status.phase),
      cancel: async () => {
        if (unit.staged && !owned) throw new Error('This client does not own a staged transaction.')
        unit.staged = false; return step('normal')
      },
      leaveUploadMode: () => step('normal'),
    }
  }
}

/**
 * Dev previews (`?preview=usb-link|base-install&unit=base|stock|none|unsupported`): the link against a pretend
 * unit, driven from the console through `modwerkUsbPreview`: plug('base' | 'stock'), unplug(),
 * playing = true, taken = true. Add `inventory=empty` for a freshly installed base and `missing=project` for
 * a project needing E-Verb, Euclid, Air Chorus and TapeHead, and `status=old` for a base without a self-test record or live load.
 * There is no pretend base build: a preview must never save a file
 * that looks like firmware.
 */
export function previewKit() {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const params = new URLSearchParams(window.location.search), kind = params.get('unit')
  if (kind === 'unsupported') return { link: new OctatrackLink(null) }
  const unit = fakeUnit(kind === 'stock' || kind === 'none' ? kind : 'base')
  unit.installed = { moduleIds: params.get('inventory') === 'empty' ? [] : ['everb', 'airwindows-chorus', 'poly8'], removedStockFx: [] }
  unit.status = params.get('status') !== 'old'
  // &base=older: a unit on an older base, so the base dialog offers the update over USB; &slots=one|two: what the
  // base's SLOTS says (one copy: Send, Restart, Save; two slots: Send, Save, Restart), absent for a base before them.
  if (params.get('base') === 'older') unit.base = unit.flashed = unit.active = 'aa'.repeat(32)
  const slots = params.get('slots')
  if (slots === 'one' || slots === 'two') {
    unit.slots = new Uint8Array(24)
    unit.slots.set([0x4d, 0x57, 0x53, 0x53, slots === 'two' ? 1 : 0, slots === 'two' ? 0 : 0xff])
  }
  if (params.get('missing') === 'project') unit.project = [{ id: 'everb', name: 'E-Verb' }, { id: 'euclid', name: 'Euclid' }, { id: 'airwindows-chorus', name: 'Air Chorus' }, { id: 'tapehead', name: 'TapeHead' }]
  Object.assign(window, { modwerkUsbPreview: unit })
  return {
    link: new OctatrackLink(unit.usb, fakeSession(unit, 60)),
    // A pretend load, stress test and inventory, so the whole flow can be clicked through.
    prepareUpdate: async (target: InventoryTarget) => {
      await wait(400); unit.pending = { moduleIds: target.moduleIds, removedStockFx: target.removedStockFx ?? [] }
      // Each load stages different bytes, so the unit's active digest (and the inventory read after Keep) changes.
      return { name: target.name, changes: [{ module: target.name, data: new TextEncoder().encode(JSON.stringify(unit.pending).padEnd(160 * 1024)) }] }
    },
    readInventory: async () => { await wait(150); return structuredClone(unit.installed) },
    stressTest: async () => { await wait(2500); return null },
  }
}
