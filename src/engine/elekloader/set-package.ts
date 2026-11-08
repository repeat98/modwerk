// SPDX-License-Identifier: GPL-3.0-or-later
// MWMS v1, sdk/runtime/loader/set_package.h. One offer and one Keep for all changes.
import { digestBytes, UPLOAD_MAX_BYTES } from './upload-wire.ts'

/** set_package.h RUNTIME_SET_CHANGES and journal.h RUNTIME_JOURNAL_ROWS: the Octatrack base's 128 installed modules. */
export const SET_CHANGES = 128
/** The newest package ABI the base's set parser takes (loader.h RUNTIME_ABI, set_package.h). */
export const SET_MAX_ABI = 10
export function encodeModuleSet(base: string, baseline: string, packages: readonly Uint8Array[]): Uint8Array {
  const baseBytes = digestBytes(base), baselineBytes = digestBytes(baseline)
  if (!packages.length || packages.length > SET_CHANGES) throw new Error(`A module set needs between 1 and ${SET_CHANGES} changes.`)
  const ids = new Set<number>()
  let bytes = 80
  for (const data of packages) {
    if (data.length < 32) throw new Error('A module package is incomplete.')
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength), id = view.getUint32(28)
    if (view.getUint32(0) !== 0x4d57524d || view.getUint16(4) < 4 || view.getUint16(4) > SET_MAX_ABI || !id || ids.has(id))
      throw new Error('A module set contains an invalid or repeated module.')
    ids.add(id); bytes += 4 + Math.ceil(data.length / 4) * 4
    if (bytes > UPLOAD_MAX_BYTES) throw new Error('The module set exceeds the upload limit.')
  }
  const data = new Uint8Array(bytes), view = new DataView(data.buffer)
  view.setUint32(0, 0x4d574d53); view.setUint16(4, 1); view.setUint16(6, packages.length); view.setUint32(8, bytes)
  data.set(baseBytes, 16); data.set(baselineBytes, 48)
  let at = 80
  for (const pkg of packages) { view.setUint32(at, pkg.length); data.set(pkg, at + 4); at += 4 + Math.ceil(pkg.length / 4) * 4 }
  return data
}

export function parseSetIdentity(view: DataView): string {
  if (view.byteLength !== 40 || view.getUint32(0) !== 0x4d575344 || view.getUint8(4) !== 1 || view.getUint8(5) !== 1 || view.getUint16(6) > SET_CHANGES)
    throw new Error('The Octatrack could not confirm its complete installed module set.')
  const bytes = new Uint8Array(view.buffer, view.byteOffset + 8, 32)
  if (bytes.every(byte => byte === 0)) throw new Error('The installed module-set identity is unknown.')
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
