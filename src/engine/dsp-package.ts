import { validateCompiledPackage } from './module-build.ts'
import { CATALOG_SOURCE, MODULES } from '../catalog/modules.ts'
import catalog from './assets/dsp-packages.json' with { type: 'json' }

export type DspPackage = {
  id: string
  key: string
  author: string
  fxId: number | null
  words: number
  code: string
  sha256: string
  relocations: readonly number[]
  init: number
  proc: number
  splitTableWords?: number
  splitProofs?: readonly { tableBase: number; programBase: number; sha256: string }[]
  tag?: string
  stockDsp?: boolean
  stockKey?: string
  hooks?: readonly { site: number; words: number; guardSha256: string; entry: number; note: string }[]
}
export type PlacedDspPackage = { words: Uint32Array; init: number; proc: number }

function packageWords(pkg: DspPackage): Uint32Array {
  if (!Number.isInteger(pkg.words) || pkg.words < 1 || pkg.words > 65535 || pkg.code.length !== pkg.words * 6 || !/^[0-9a-f]+$/.test(pkg.code)) throw new Error('The module package has invalid DSP words.')
  const words = Uint32Array.from({ length: pkg.words }, (_, i) => parseInt(pkg.code.slice(i * 6, i * 6 + 6), 16))
  if (![pkg.init, pkg.proc].every(entry => Number.isInteger(entry) && entry >= 0 && entry < words.length)) throw new Error('The module package entry points are invalid.')
  const seen = new Set<number>()
  if (pkg.splitTableWords !== undefined && (!Number.isInteger(pkg.splitTableWords) || pkg.splitTableWords < 1 || pkg.splitTableWords >= words.length || Math.min(pkg.init, pkg.proc) < pkg.splitTableWords)) throw new Error('The DSP table split is invalid.')
  for (const offset of pkg.relocations) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= words.length || seen.has(offset) || words[offset] >= words.length) throw new Error('The module package relocation table is invalid.')
    seen.add(offset)
    if (pkg.splitTableWords !== undefined && offset < pkg.splitTableWords) throw new Error('The DSP table contains a code relocation.')
  }
  return words
}

export async function readDspPackage(id: string, tag?: string): Promise<DspPackage> {
  if (catalog.schema !== 1 || catalog.revision !== CATALOG_SOURCE.revision) throw new Error('Module packages do not match the catalog revision.')
  const pkg = catalog.packages.find(pkg => pkg.id === id && (!('tag' in pkg) || pkg.tag === tag))
  if (!pkg) throw new Error('This module needs a different native placement path.')
  const module = MODULES.find(module => module.id === id)
  if (!module || module.key !== pkg.key || module.author !== pkg.author || (module.fxId ?? null) !== pkg.fxId) throw new Error('The module package does not match its catalog entry.')
  validateCompiledPackage(pkg.id, pkg.version)
  const words = packageWords(pkg)
  const bytes = new Uint8Array(words.length * 3)
  words.forEach((word, i) => { bytes[i * 3] = word >>> 16; bytes[i * 3 + 1] = word >>> 8; bytes[i * 3 + 2] = word })
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer)
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (sha256 !== pkg.sha256) throw new Error('The module package checksum does not match.')
  return pkg
}

// Allocation and resident dependencies belong to the composer. This helper
// relocates one already allocated package; it does not prove a selection fits.
export function relocateDspPackage(pkg: DspPackage, base: number, tableBase?: number): PlacedDspPackage {
  const words = packageWords(pkg)
  if (!Number.isInteger(base) || base < 0 || base + words.length > 0x1000000) throw new Error('The DSP package placement is outside program memory.')
  if (tableBase !== undefined && (!pkg.splitTableWords || !Number.isInteger(tableBase) || tableBase < 0 || tableBase + pkg.splitTableWords > 0x1000000)) throw new Error('The DSP table placement is outside program memory.')
  if (tableBase !== undefined && tableBase < base + words.length && base + pkg.splitTableWords! < tableBase + pkg.splitTableWords!) throw new Error('The DSP table overlaps its program.')
  for (const offset of pkg.relocations) words[offset] += tableBase !== undefined && words[offset] < pkg.splitTableWords! ? tableBase : base
  return { words, init: base + pkg.init, proc: base + pkg.proc }
}
