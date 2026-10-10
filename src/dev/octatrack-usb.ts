// SPDX-License-Identifier: GPL-3.0-or-later
// Chrome page for a hardware run of the private Octatrack base (dev/octatrack-usb.html,
// served by `npm run dev` only). Claims only Modwerk's vendor interface.
import { findVendorInterface, type ControlDevice } from '../engine/elekloader/upload-usb.ts'
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

async function run(lifecycle: boolean) {
  if (!usb) return log('WebUSB is unavailable: use Chrome on http://localhost.')
  const device = await usb.requestDevice({ filters: [{ vendorId: 0x1935 }] })
  await device.open()
  if (!device.configuration) await device.selectConfiguration(1)
  const index = findVendorInterface(device.configuration)
  if (index === undefined) { await device.close(); return log('No Modwerk vendor interface: this unit is not running the test base.') }
  await device.claimInterface(index)
  try {
    if (lifecycle) await runLifecycle(device, index, log)
    log('DIAG ' + JSON.stringify(await diagnostics(device, index)))
  } catch (error) {
    log(String(error) + (/enter: unsafe/.test(String(error)) ? ' (stop playback and recording, then run again)' : ''))
  } finally {
    await device.releaseInterface(index); await device.close()
  }
}
for (const [id, lifecycle] of [['run', true], ['diag', false]] as const)
  document.getElementById(id)!.addEventListener('click', () => { run(lifecycle).catch(error => log(String(error))) })
