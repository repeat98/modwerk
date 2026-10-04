// SPDX-License-Identifier: GPL-3.0-or-later
// Local-only stock inspection. Only metadata leaves the browser worker.
import { LINK_DEVICES, type LinkDevice } from './elemod.ts'
import { ELE3_DEVICES, mainImage, readEle3Syx } from './ele3.ts'
import { sha256Hex } from './hash.ts'
import { DIGITAKT_II_IDENTITY, DIGITAKT_II_READER, verifyDigitaktIiSeal } from './digitakt-ii'

export type DigiMachine = 'digitakt' | 'digitone' | 'digitakt-ii'
type FirmwareIdentity = Pick<LinkDevice, 'name' | 'releases'> & { machine: DigiMachine }
const FIRMWARE_IDENTITIES: readonly FirmwareIdentity[] = [...LINK_DEVICES, DIGITAKT_II_IDENTITY]
export type DigiFirmwareInspection = { machine: DigiMachine; release: string; name: string; bytes: number; sha256: string }
export const MAX_DIGI_FIRMWARE_BYTES = 8 * 1024 * 1024

/** Verify complete file identity, container integrity and the unpacked main image. */
export async function inspectDigiFirmware(machine: DigiMachine, bytes: Uint8Array, name: string, devices: readonly FirmwareIdentity[] = FIRMWARE_IDENTITIES): Promise<DigiFirmwareInspection> {
  const device = devices.find(entry => entry.machine === machine)
  if (!device) throw new Error('This machine cannot read firmware yet.')
  if (!bytes.length || bytes.length > MAX_DIGI_FIRMWARE_BYTES) throw new Error('Choose one original .syx OS file for this machine.')
  const sha256 = await sha256Hex(bytes), release = device.releases.find(entry => entry.syxSha256 === sha256)
  if (!release) throw new Error('This is not a supported original ' + device.name + ' OS file. Choose OS ' + device.releases.map(entry => entry.version).join(' or ') + ' from Elektron.')
  const file = readEle3Syx(bytes)
  if (machine === 'digitakt-ii') await verifyDigitaktIiSeal(file)
  const image = mainImage(file, machine === 'digitakt-ii' ? DIGITAKT_II_READER : ELE3_DEVICES[machine])
  if (image.length !== release.mainLength || await sha256Hex(image) !== release.mainSha256) throw new Error('The OS file failed its integrity check. Choose the original download again.')
  return { machine, release: release.version, name, bytes: bytes.length, sha256 }
}
