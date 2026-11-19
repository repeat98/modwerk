// SPDX-License-Identifier: GPL-3.0-or-later
// Fit a built OS upgrade to the unit's limit. Some units refuse an upgrade past a size of their own (the Digitone II
// at about 2 MiB decoded: docs/verification/2026-11-19-digitone-ii-base-on-a-unit.md), and the kit's greedy packer
// leaves its main OS larger than Elektron's. Past the limit, the main OS is packed again with the optimal parse
// (packOptimal), written and sealed by the kit's own writer and checked by its verifier, so only the stored bytes of the
// main section change; an upgrade that still does not fit is refused here, before anything is sent.
import { load, mainImage, parse, verify, write, type Parsed } from '../../../vendor/elekloader/kit/src/formats.ts'
import type { Device } from '../../../vendor/elekloader/kit/src/devices.ts'
import { packSectionOptimal } from '../elektron/codec/pack.ts'
import { UPDATE_LIMITS } from './carried-devices'

export type Fitted = { syx: Uint8Array; decoded: number; limit: number | null; repacked: boolean }

/** The bytes an upgrade holds once decoded: the 8-byte preamble and its container. */
export const decodedSize = (file: Parsed): number => 8 + (file as { total: number }).total

/** The most an upgrade for this device may hold once decoded, or null where no limit is known. */
export const updateLimit = (device: Device): number | null => UPDATE_LIMITS[device.key] ?? null

/** `built` (an ELE3 .syx the kit wrote from `stockRaw`) as it may be sent to the unit. */
export async function fitUpdate(built: Uint8Array, stockRaw: Uint8Array): Promise<Fitted> {
  const [stock, device] = await load(stockRaw)
  if (device.container !== 'ele3') return { syx: built, decoded: built.length, limit: null, repacked: false }
  const file = parse(built, device), limit = updateLimit(device)
  if (limit === null || decodedSize(file) <= limit) return { syx: built, decoded: decodedSize(file), limit, repacked: false }
  const image = mainImage(file, device), version = (file as { version: string }).version
  const stored = packSectionOptimal(image)
  const padded = stored.length % 4 ? Uint8Array.from([...stored, ...new Uint8Array(4 - stored.length % 4)]) : stored
  const outputs = write(stock, padded, device, version)
  verify(outputs, stock, image, device, version)
  const decoded = decodedSize(parse(outputs.syx, device))
  if (decoded > limit) {
    throw new Error(`This build holds ${decoded} bytes once decoded, and the ${device.name} takes at most ${limit}: leave a module out.`)
  }
  return { syx: outputs.syx, decoded, limit, repacked: true }
}

type Output = { name: string; path: string; bytes: number; sha256: string; data: ArrayBuffer }
type BuiltFiles = { device: string; files: Output[]; sha256: string; bytes: number }

/** A site build's result with every .syx fitted to its device's limit (fitUpdate); a device with no known limit keeps
 * the result as it is, so other machines' builds do not change. The top-level sha256 and bytes follow the .syx. */
export async function fitBuilt<T extends BuiltFiles>(result: T, stockRaw: Uint8Array): Promise<T> {
  if (!(result.device in UPDATE_LIMITS)) return result
  const files: Output[] = []
  let top = { sha256: result.sha256, bytes: result.bytes }
  for (const file of result.files) {
    if (!file.name.toLowerCase().endsWith('.syx')) { files.push(file); continue }
    const fitted = await fitUpdate(new Uint8Array(file.data), stockRaw)
    if (!fitted.repacked) { files.push(file); continue }
    const data = fitted.syx.slice().buffer, sha256 = await sha256Hex(fitted.syx)
    if (file.sha256 === result.sha256) top = { sha256, bytes: fitted.syx.length }
    files.push({ ...file, data, sha256, bytes: fitted.syx.length })
  }
  return { ...result, files, ...top }
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}
