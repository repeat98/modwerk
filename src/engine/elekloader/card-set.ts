// SPDX-License-Identifier: GPL-3.0-or-later
// MWST v1: the file the Modwerk base keeps its module set in on the card (sdk/machines/octatrack/elekloader/modset.c),
// written here so a set reaches the unit by card as it does over USB: the same packages, installed at power-on by the
// base's loader with the checks of a USB install. The base loads only a file stamped with its own identity, whose
// SHA-256 matches, and of its two files (/MODWERK0.SET, /MODWERK1.SET) the one with the higher generation.
import { sha256 } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { digestBytes, SAVED_SET_CAPACITY } from './upload-wire.ts'
import { SET_CHANGES, SET_MAX_ABI } from './set-package.ts'

/** The name to give the file in the card's top folder. */
export const CARD_SET_FILE = 'MODWERK0.SET'
export const CARD_RECOVERY_FILE = 'MODWERK1.SET'
const HEADER = 84, SECTOR = 512
const padded = (bytes: number) => Math.ceil(bytes / 4) * 4

/** Initial generation for an export. A card with a second slot needs its own ordering at import time. */
export const cardSetGeneration = (now = Date.now()) => Math.floor(now / 1000)

/** Prepare an export for slot zero alongside the retained slot one. The generation is outside the payload digest. */
export function forCardImport(file: Uint8Array, retained?: Uint8Array): Uint8Array<ArrayBuffer> {
  function header(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < HEADER || view.getUint32(0) !== 0x4d575354 || ![1, 2].includes(view.getUint32(4)) ||
        view.getUint32(16) < HEADER || view.getUint32(16) > bytes.length)
      throw new Error('Choose a complete Modwerk set file.')
    return view
  }
  const selected = header(file), used = selected.getUint32(16)
  if (selected.getUint32(4) !== 1 || used > SAVED_SET_CAPACITY || !sha256(file.subarray(HEADER, used)).every((byte, i) => byte === file[52 + i]))
    throw new Error('Choose an intact exported module set.')
  const other = retained && header(retained)
  const sameBase = retained && file.subarray(20, 52).every((byte, i) => byte === retained[20 + i])
  const generation = Math.max(selected.getUint32(8), sameBase && other ? other.getUint32(8) + 1 : 1)
  if (generation > 0xfffffffe) throw new Error('The card generation is full. Back up both slot files outside the top folder before importing.')
  const copy = Uint8Array.from(file)
  new DataView(copy.buffer).setUint32(8, generation)
  return copy
}

/** The set file for the base `base` (its identity) holding `packages`, each exactly as USB sync would stage it. Whole
 * sectors, as the base writes and reads it; the header carries the length in use. */
export function encodeCardSet(base: string, packages: readonly Uint8Array[], generation: number): Uint8Array {
  if (!Number.isInteger(generation) || generation < 1 || generation > 0xfffffffe) throw new Error('A module set file needs a generation the unit can count on from.')
  if (packages.length > SET_CHANGES) throw new Error(`A module set holds at most ${SET_CHANGES} modules.`)
  const ids = new Set<number>()
  let bytes = HEADER
  for (const data of packages) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    // A package with no image, hooks, sites or DSP code removes its module (modset.c `removes`): never part of a set.
    const removes = () => !view.getUint32(8) && !view.getUint32(12) && !view.getUint32(20) && !view.getUint32(24) && (data.length < 36 || view.getUint16(4) < 5 || !view.getUint32(32))
    if (data.length < 32 || view.getUint32(0) !== 0x4d57524d || view.getUint16(4) < 4 || view.getUint16(4) > SET_MAX_ABI || !view.getUint32(28) || ids.has(view.getUint32(28)) || removes())
      throw new Error('A module set contains an invalid or repeated module.')
    ids.add(view.getUint32(28)); bytes += 8 + padded(data.length)
  }
  if (bytes > SAVED_SET_CAPACITY) throw new Error('This module set is too large for the Octatrack’s module file.')
  const file = new Uint8Array(Math.ceil(bytes / SECTOR) * SECTOR), view = new DataView(file.buffer)
  file.set([0x4d, 0x57, 0x53, 0x54]); view.setUint32(4, 1); view.setUint32(8, generation); view.setUint32(12, packages.length); view.setUint32(16, bytes)
  file.set(digestBytes(base), 20)
  let at = HEADER
  for (const data of packages) { view.setUint32(at, new DataView(data.buffer, data.byteOffset).getUint32(28)); view.setUint32(at + 4, data.length); file.set(data, at + 8); at += 8 + padded(data.length) }
  file.set(sha256(file.subarray(HEADER, bytes)), 52)
  return file
}
