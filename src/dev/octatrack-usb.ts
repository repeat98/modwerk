// SPDX-License-Identifier: GPL-3.0-or-later
// Chrome page for a hardware run of the private Octatrack base (dev/octatrack-usb.html,
// served by `npm run dev` only). Claims only Modwerk's vendor interface.
import { findVendorInterface, type ControlDevice } from '../engine/elekloader/upload-usb.ts'
import { encodeUploadRequest } from '../engine/elekloader/upload-wire.ts'
import { diagnostics, runLifecycle } from './octatrack-usb-lifecycle.ts'

// lib.dom has no WebUSB types; only what this page calls.
interface WebUsbDevice extends ControlDevice {
  configuration: Parameters<typeof findVendorInterface>[0]
  open(): Promise<void>; close(): Promise<void>
  selectConfiguration(value: number): Promise<void>
  claimInterface(index: number): Promise<void>; releaseInterface(index: number): Promise<void>
}
const usb = (navigator as Navigator & { usb?: { requestDevice(o: { filters: { vendorId: number }[] }): Promise<WebUsbDevice> } }).usb
const output = document.querySelector('pre')!
const log = (line: string) => { output.textContent += line + '\n' }
const explain = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` + (error.cause ? ' <- ' + explain(error.cause) : '') : String(error)
const hex = (view: DataView) => Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), b => b.toString(16).padStart(2, '0')).join('')

/** One HELLO by hand: how SUBMIT ends (ok, stall or no completion), with RESULT and DIAG around it. */
async function probe(device: WebUsbDevice, index: number) {
  const setup = (request: number, value: number) => ({ requestType: 'vendor' as const, recipient: 'interface' as const, request, value, index })
  const timed = async <T extends { status: string; bytesWritten?: number; data?: DataView }>(what: string, run: () => Promise<T>) => {
    const start = performance.now(), ms = () => Math.round(performance.now() - start) + ' ms'
    try {
      const reply = await Promise.race([run(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no completion after 3 s')), 3000))])
      log(`${what}: ${reply.status}${reply.bytesWritten !== undefined ? `, ${reply.bytesWritten} B written` : ''}${reply.data ? ', ' + hex(reply.data) : ''} (${ms()})`)
      return reply
    } catch (error) { log(`${what}: ${explain(error)} (${ms()})`) }
  }
  const diag = async (what: string) => { try { log(`DIAG ${what} ` + JSON.stringify(await diagnostics(device, index))) } catch (error) { log(`DIAG ${what}: ${explain(error)}`) } }
  await diag('before')
  const before = await timed('RESULT before', () => device.controlTransferIn(setup(2, 0), 152))
  const sequence = ((before?.data && before.data.byteLength >= 8 ? before.data.getUint16(6) : 0) + 1) & 0xffff
  await timed(`SUBMIT HELLO, sequence ${sequence}`, () => device.controlTransferOut(setup(1, sequence), encodeUploadRequest({ command: 'hello' })))
  await timed('RESULT after', () => device.controlTransferIn(setup(2, 0), 152))
  await diag('after')
}

async function run(mode: 'run' | 'diag' | 'probe') {
  if (!usb) return log('WebUSB is unavailable: use Chrome on http://localhost.')
  const device = await usb.requestDevice({ filters: [{ vendorId: 0x1935 }] })
  await device.open()
  if (!device.configuration) await device.selectConfiguration(1)
  const index = findVendorInterface(device.configuration)
  if (index === undefined) { await device.close(); return log('No Modwerk vendor interface: this unit is not running the test base.') }
  await device.claimInterface(index)
  try {
    if (mode === 'probe') return await probe(device, index)
    if (mode === 'run') await runLifecycle(device, index, log)
    log('DIAG ' + JSON.stringify(await diagnostics(device, index)))
  } catch (error) {
    log(explain(error) + (/enter: unsafe/.test(String(error)) ? ' (stop playback and recording, then run again)' : ''))
  } finally {
    await device.releaseInterface(index); await device.close()
  }
}
for (const mode of ['run', 'diag', 'probe'] as const)
  document.getElementById(mode)!.addEventListener('click', () => { run(mode).catch(error => log(explain(error))) })
