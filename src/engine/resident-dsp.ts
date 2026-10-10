import { validateCompiledPackage } from './module-build.ts'
import catalog from './assets/resident-dsp.json' with { type: 'json' }
import stockMetadata from './assets/stock-dsp-metadata.json' with { type: 'json' }
import { CATALOG_SOURCE, MODULES, resolveSelection } from '../catalog/modules.ts'
import { relocateDspPackage, type DspPackage } from './dsp-package.ts'
import { adjustStockAddresses, dspWordsHash, type StockDspCore } from './stock-dsp.ts'
import { parseDspMemory, readDspWords, writeDspWords } from './dsp-memory.ts'
import { OS_LOAD_ADDRESS, type OsWrite } from './os-patches.ts'

async function sha(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function validateCatalog() {
  if (catalog.schema !== 1 || catalog.revision !== CATALOG_SOURCE.revision || catalog.sourceSha256 !== stockMetadata.sourceSha256) throw new Error('Resident DSP templates do not match the pinned catalog.')
}
export async function readResidentCharacter(): Promise<DspPackage & { fxId: number }> {
  validateCatalog()
  const pkg = catalog.character, module = MODULES.find(module => module.id === 'character')!
  if (pkg.id !== module.id || pkg.key !== module.key || pkg.author !== module.author || pkg.fxId !== module.fxId || pkg.mode !== 'resident' || pkg.xbusBase !== 0x36000 || pkg.ptableMemory !== 'P') throw new Error('The resident Character package has invalid attribution or placement requirements.')
  validateCompiledPackage(pkg.id, pkg.version)
  const words = relocateDspPackage(pkg, 0).words
  if (await dspWordsHash(words) !== pkg.sha256) throw new Error('The resident Character checksum does not match.')
  return pkg
}

// Profile currently matches the native default stock FX1 chooser, whose DJ EQ
// keeps the curve bank live. A custom chooser that releases it needs the
// native X-table profile, not this P-table placement.
export async function composeDynamicDsp(cores: readonly StockDspCore[], ids: readonly string[]) {
  validateCatalog()
  const selection = resolveSelection(ids), hasCharacter = selection.some(module => module.id === 'character')
  if (cores.length !== 2 || cores.filter(core => core.core === 0).length !== 1 || cores.filter(core => core.core === 1).length !== 1) throw new Error('DSP composition requires both stock cores.')
  const character = hasCharacter ? await readResidentCharacter() : null
  const writes: OsWrite[] = [], layouts = []
  for (const core of [...cores].sort((a,b) => a.core - b.core)) {
    const stock = stockMetadata.payloads.find(payload => payload.core === core.core)!
    if (core.tag !== stock.tag || core.effectStart !== stock.effectStart || core.effectEnd !== stock.effectEnd || core.sharedEnd !== stock.sharedEnd || await sha(core.memory.bytes) !== stock.sha256) throw new Error('DSP composition needs the verified original payload geometry.')
    const variant = catalog.variants.find(variant => variant.core === core.core && variant.hasCharacter === hasCharacter)!
    const table = core.sharedEnd + (character?.words ?? 0)
    if (!variant || variant.tag !== core.tag || variant.tableAddress !== table || variant.tableAddress + variant.tableWords !== variant.codeAddress || variant.codeAddress + variant.words !== core.effectEnd || variant.tableWords < 1131) throw new Error('The resident DSP profile does not fit its effect region.')
    if (!Number.isInteger(variant.words) || variant.words < 1 || variant.words > 4096 || variant.code.length !== variant.words * 6 || !/^[0-9a-f]+$/.test(variant.code)) throw new Error('The DSP receiver template has invalid words.')
    const receiver = Uint32Array.from({ length: variant.words }, (_, i) => parseInt(variant.code.slice(i * 6, i * 6 + 6), 16))
    if (await dspWordsHash(receiver) !== variant.sha256) throw new Error('The DSP receiver template checksum does not match.')
    const copy = variant.stockCopy
    if (copy.words !== 9 || copy.adjustments.length !== 1 || copy.adjustments[0].offset !== 3 || copy.adjustments[0].delta !== variant.codeAddress + copy.destinationOffset - copy.sourceAddress || copy.destinationOffset < 0 || copy.destinationOffset + copy.words !== receiver.length || receiver.subarray(copy.destinationOffset).some(word => word !== 0)) throw new Error('The DSP receiver stock-copy placeholder is invalid.')
    const source = readDspWords(core.memory, 0, copy.sourceAddress, copy.words)
    if (await dspWordsHash(source) !== copy.sourceSha256) throw new Error('The local stock DSP stub does not match its source fingerprint.')
    const restored = adjustStockAddresses(source, copy.adjustments)
    if (copy.sha256 && await dspWordsHash(restored) !== copy.sha256) throw new Error('The local DSP stub relocation does not match.')
    receiver.set(restored, copy.destinationOffset)
    if (variant.completeSha256 && await dspWordsHash(receiver) !== variant.completeSha256) throw new Error('The recovered DSP receiver does not match the native assembly.')
    if (await dspWordsHash(readDspWords(core.memory, 0, variant.hook.address, 2)) !== variant.hook.sha256) throw new Error('The DSP frame hook is not at its stock site.')
    const memory = parseDspMemory(new Uint8Array(core.memory.bytes))
    if (core.shared.length !== stock.shared.length) throw new Error('Shared DSP routines do not match the stock recipe count.')
    let sharedEnd = core.effectStart
    for (const [index, shared] of core.shared.entries()) {
      const recipe = stock.shared[index]
      if (shared.words.length !== recipe.words || shared.destination !== recipe.destination || await dspWordsHash(shared.words) !== recipe.sha256) throw new Error('The shared DSP routine fingerprint does not match its recovery recipe.')
      if (shared.destination !== sharedEnd || !shared.words.length) throw new Error('Shared DSP routines are not contiguous.')
      writeDspWords(memory, 0, shared.destination, shared.words); sharedEnd += shared.words.length
    }
    if (sharedEnd !== core.sharedEnd) throw new Error('Shared DSP routines do not match the reserved extent.')
    writeDspWords(memory, 0, table, new Uint32Array(variant.tableWords))
    writeDspWords(memory, 0, variant.codeAddress, receiver)
    writeDspWords(memory, 0, variant.hook.address, new Uint32Array([0x0bf080, variant.frame]))
    // The shared X dispatch table has init[32], then process[32]. Managed
    // packages begin at the native null entry until the runtime binds them.
    const nulled = new Set([0,...stock.packages.map(pkg => pkg.fxId),...catalog.customIds])
    for (const id of nulled) {
      writeDspWords(memory, 1, 0x215 + id, new Uint32Array([variant.nullInit]))
      writeDspWords(memory, 1, 0x235 + id, new Uint32Array([variant.nullProc]))
    }
    if (character) {
      const placed = relocateDspPackage(character, core.sharedEnd)
      writeDspWords(memory, 0, core.sharedEnd, placed.words)
      writeDspWords(memory, 1, 0x215 + character.fxId, new Uint32Array([placed.init]))
      writeDspWords(memory, 1, 0x235 + character.fxId, new Uint32Array([placed.proc]))
    }
    writes.push({ address: OS_LOAD_ADDRESS + stock.sourceOffset, guardLength: stock.bytes, guardSha256: stock.sha256, bytes: memory.bytes, note: 'DSP payload ' + core.tag })
    layouts.push({ core: core.core, tag: core.tag, effectStart: core.effectStart, effectEnd: core.effectEnd, sharedWords: core.sharedEnd - core.effectStart, residentWords: character?.words ?? 0, receiverWords: variant.words, tableAddress: table, tableWords: variant.tableWords, availablePackageWords: variant.tableWords - 64 })
  }
  return { writes, layouts }
}
