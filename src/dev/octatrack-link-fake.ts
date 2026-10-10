// SPDX-License-Identifier: GPL-3.0-or-later
// A pretend Octatrack for the link's tests and the dev previews
// (`?preview=usb-link`, `?preview=base-install`): enumerates like the base, answers IDENTIFY with
// real bytes, and runs the upload session's phases with no device behind them.
import { OctatrackLink, type LinkDevice, type LinkSession, type LinkUsb } from '../engine/elekloader/octatrack-link.ts'
import { UploadDeviceError } from '../engine/elekloader/upload-session.ts'
import { VENDOR_CLASS, VENDOR_PROTOCOL, VENDOR_SUBCLASS } from '../engine/elekloader/upload-usb.ts'
import type { UploadPhaseName, UploadResultName, UploadStatus } from '../engine/elekloader/upload-wire.ts'

export const FAKE_BASE = '5b'.repeat(32)
const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
/** IDENTIFY as sdk/runtime/upload/vendor.c sends it: version 1, can submit, limits, base, model. */
const identity = Uint8Array.from([...ascii('MWUI'), 1, 1, 0, 1, 0x10, 0x34, 0, 0x98, 0, 0, 0, 0,
  ...Array.from({ length: 32 }, () => 0x5b), ...ascii('OCTATRACK MKII'), 0, 0, ...new Array(8).fill(0)])

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
      async controlTransferIn(setup: { request: number }) {
        return setup.request === 3 ? { status: 'ok', data: new DataView(identity.buffer.slice(0)) } : { status: 'stall' }
      },
    }
    return device
  }
  let device: LinkDevice | undefined = kind === 'none' ? undefined : make(kind === 'base')
  const unit: FakeUnit = {
    taken: false, playing: false, active: FAKE_BASE,
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
  return async (): Promise<LinkSession> => {
    let status: UploadStatus = { command: 'hello', transaction: 0, result: 'ok', phase: 'normal', activeKnown: true, generation: 0,
      lastTransaction: 0, currentTransaction: 0, received: 0, capacity: 262144, base: FAKE_BASE, session: '00'.repeat(32), active: unit.active }
    let staged = unit.active
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
        staged = pkg.sha256
        for (let sent = 0; sent < pkg.data.length;) {
          if (signal?.aborted) { status = { ...status, phase: 'normal' }; throw new DOMException('Module staging cancelled.', 'AbortError') }
          await wait()
          sent = Math.min(pkg.data.length, sent + 4096); progress?.(sent, pkg.data.length)
        }
        return step('verified')
      },
      activate: () => step('pending'),
      startTrial: async () => status = { ...await step('trial'), active: staged },
      holdTrial: () => step('pending', unit.playing ? 'unsafe' : undefined),
      accept: async () => { await step('ready'); unit.active = status.active!; return status },
      rollback: async () => status = { ...await step('ready'), active: unit.active },
      cancel: () => step('normal'),
      leaveUploadMode: () => step('normal'),
    }
  }
}

/**
 * Dev previews (`?preview=usb-link|base-install&unit=base|stock|none|unsupported`): the link against a pretend
 * unit, driven from the console through `modwerkUsbPreview`: plug('base' | 'stock'), unplug(),
 * playing = true, taken = true. There is no pretend base build: a preview must never save a file
 * that looks like firmware.
 */
export function previewLink() {
  const kind = new URLSearchParams(window.location.search).get('unit')
  if (kind === 'unsupported') return new OctatrackLink(null)
  const unit = fakeUnit(kind === 'stock' || kind === 'none' ? kind : 'base')
  Object.assign(window, { modwerkUsbPreview: unit })
  return new OctatrackLink(unit.usb, fakeSession(unit, 60))
}
