// SPDX-License-Identifier: GPL-3.0-or-later
// One interface over the OS file families a machine uses (Device.container): 'ele3' (syx-container.ts) and 'elek'
// (octatrack-container.ts).
//
//     const [stock, dev, rel] = await load(bytes)     // a stock file (or Elektron's zip of it), known by its hash
//     const outputs = write(stock, storedMain, dev, version)   // {syx} or {syx, bin}
//     const facts = verify(outputs, stock, wantMain, dev, version)
import { encodeAsciiReplace, equal, sha } from './bytes.ts'
import { type Device, type Release, UnknownFirmware, identify, supported } from './devices.ts'
import * as elek from './octatrack-container.ts'
import { hexw, type Loose } from './py.ts'
import * as syx from './syx-container.ts'
import { BadZipFile, members, read } from './zip.ts'

export class FormatError extends Error {}

export type Parsed = syx.Syx | elek.ElekFile

/** Runs `f`, a container error as a FormatError. */
function asFormatError<T>(f: () => T): T {
  try {
    return f()
  } catch (e) {
    if (e instanceof syx.SyxError || e instanceof elek.ElekError) throw new FormatError(e.message)
    throw e
  }
}

/** A file of `dev`'s family, parsed. */
export function parse(raw: Uint8Array, dev: Device): Parsed {
  if (dev.container === 'ele3') return asFormatError(() => new syx.Syx(raw))
  if (dev.container === 'elek') return asFormatError(() => new elek.ElekFile(raw))
  throw new FormatError(`${dev.name}: no reader for the ${dev.container} family`)
}

const byName = (a: { filename: string }, b: { filename: string }) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0)
const syxFirst = (m: { filename: string }) => (m.filename.toLowerCase().endsWith('.syx') ? 0 : 1)

/** The known stock OS file inside a zip as Elektron publishes them: the first .syx, else .bin, the builder knows. */
async function fromZip(raw: Uint8Array): Promise<Uint8Array> {
  let candidates: ReturnType<typeof members>
  try {
    candidates = members(raw).filter(m => !m.filename.endsWith('/') && m.fileSize <= 64 << 20 && /\.(syx|bin)$/i.test(m.filename))
    candidates.sort((a, b) => syxFirst(a) - syxFirst(b) || byName(a, b))
    for (const m of candidates) {
      const data = await read(raw, m)
      try {
        identify(sha(data))
        return data
      } catch (e) {
        if (!(e instanceof UnknownFirmware)) throw e
      }
    }
  } catch (e) {
    if (e instanceof BadZipFile) throw new FormatError('the zip cannot be read: ' + e.message)
    throw e
  }
  throw new UnknownFirmware(`the zip holds no stock firmware this builder knows (${candidates.map(m => m.filename).join(', ') || 'no .syx or .bin file'}). Supported: ${supported()}`)
}

const isZip = (raw: Uint8Array) => raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x03 && raw[3] === 0x04

/** A stock OS file (or a zip holding one), parsed, with its machine and release, known by its sha256. */
export async function load(raw: Uint8Array): Promise<[Parsed, Device, Release]> {
  const file = isZip(raw) ? await fromZip(raw) : raw
  const [dev, rel] = identify(sha(file))
  return [parse(file, dev), dev, rel]
}

export const mainImage = (parsed: Parsed, dev: Device): Uint8Array => parsed.section(dev.mainSection)

/** Refuses a version the machine's field cannot show. */
export function checkVersion(dev: Device, version: string | null): void {
  if (version === null) return
  const n = encodeAsciiReplace(version).length
  if (dev.container === 'ele3' && n !== dev.versionLen) throw new FormatError(`the version is exactly ${dev.versionLen} ASCII characters`)
  if (n <= 0 || n > dev.versionLen) throw new FormatError(`the version is 1 to ${dev.versionLen} ASCII characters`)
}

/** A main OS image as `dev`'s family stores it. */
export const packMain = (image: Uint8Array, dev: Device): Uint8Array => (dev.container === 'ele3' ? syx.packMain(image) : elek.packMain(image))

export type Outputs = { syx: Uint8Array; bin?: Uint8Array }

/** {syx}, or {syx, bin} for a family with a card file. */
export function write(stock: Parsed, storedMain: Uint8Array, dev: Device, version: string | null = null): Outputs {
  checkVersion(dev, version)
  return asFormatError(() => (dev.container === 'ele3' ? { syx: syx.write(stock as syx.Syx, storedMain, dev, version) } : elek.write(stock as elek.ElekFile, storedMain, dev, version)))
}

/** Every output re-read and refused unless only the main OS (and the version field) changed and the protected ranges
 * are stock's; its facts otherwise. */
export function verify(outputs: Outputs, stock: Parsed, wantMain: Uint8Array, dev: Device, version: string | null = null) {
  const stockMain = mainImage(stock, dev)
  const facts: Record<string, Loose> = asFormatError(() => {
    if (dev.container !== 'ele3') return elek.verify(outputs as Record<string, Uint8Array>, stock as elek.ElekFile, wantMain, dev, stockMain, version)
    const result = syx.verify(outputs.syx, stock as syx.Syx, wantMain, dev, version)
    const untouched = [...(result.sections as Map<string, syx.Section>)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).filter(([, s]) => s.stock).map(([id]) => id)
    result.untouched = [`sections ${untouched.join(', ')}, byte for byte`]
    return result
  })
  for (const [lo, hi, why] of dev.protected) {
    const a = lo - dev.mainLoad, b = hi - dev.mainLoad
    if (!equal(wantMain.subarray(a, b), stockMain.subarray(a, b))) throw new FormatError(`0x${hexw(lo)}-0x${hexw(hi)} (${why}) is not stock`)
  }
  return facts
}
