// SPDX-License-Identifier: GPL-3.0-or-later
// Find and claim a unit's Modwerk vendor interface with node-usb (WebUSB API,
// WinUSB on Windows), for the agent bridge. Claims nothing else: no mass-storage
// or audio interface, and never selects a configuration.
import { usb } from 'usb'
import { ELEKTRON_VENDOR_ID } from './site.mjs'

const modwerk = alternate => alternate.interfaceClass === 0xff && alternate.interfaceSubclass === 0x4d && alternate.interfaceProtocol === 1

/** The first Elektron device with exactly one Modwerk vendor interface, opened and claimed; null when none runs a Modwerk base.
 * The first Elektron device may be another instrument (an Analog Rytm on Overbridge), so each one is checked. */
export async function openUnit() {
  let failure = null
  for (const device of await usb.getDevices()) {
    if (device.vendorId !== ELEKTRON_VENDOR_ID) continue
    try {
      await device.open()
      const vendor = (device.configuration?.interfaces ?? []).filter(item => item.alternates.some(modwerk))
      if (vendor.length === 1) {
        await device.claimInterface(vendor[0].interfaceNumber)
        return device
      }
    } catch (error) {
      failure = error
    }
    await device.close().catch(() => {})
  }
  if (failure) throw failure // e.g. the interface is held by another program
  return null
}
