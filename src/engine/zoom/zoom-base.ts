// The Zoom MultiStomp base: MIDISTOMP's patches (vendor/midistomp, Luca Matturro, MIT) applied in the browser to the
// user's own MS-70CDR 2.10 OS, byte for byte what zoomms builds (its cli._apply_patches). The repository holds no Zoom
// bytes: guards are hashes, and what a patch repeats from Zoom's files is copied from the user's own
// (scripts/midistomp-import.ts).
import midistomp from '../../../vendor/midistomp/midistomp.json'
import { addSection, buildPart, concat, hex, parseAis, span } from './ais'

type Part = ['hex', string] | ['copy', string, number, number]
type Entry = { model: string; addr?: number; offset?: number; data: string | Part[]; expect_sha256?: string; expect_length?: number }
export type ZoomPatch = { name: string; description?: string; builds?: string[]; write?: Entry[]; section?: Entry[]; bin133?: Entry[] }
/** Zoom's own parts, as the Mac updater keeps them (Contents/Resources) and the Windows one as BIN/129 and BIN/133. */
export type ZoomStock = { 'Main.bin': Uint8Array; 'Preset.bin': Uint8Array }
export const MIDISTOMP = midistomp as Omit<typeof midistomp, 'patches'> & { patches: ZoomPatch[] }

const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], byte => parseInt(byte, 16))
export async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice())), b => b.toString(16).padStart(2, '0')).join('')
}

/** Applies patches in order to a stock OS and Preset.bin (the boot logo block): zoomms' patcher, with hashed guards. */
export async function applyPatches(stock: ZoomStock, patches: ZoomPatch[], build: string) {
  const img = parseAis(stock['Main.bin']), preset = stock['Preset.bin'].slice()
  const bytes = (data: Entry['data']) => typeof data === 'string' ? fromHex(data) : concat(data.map(part => {
    if (part[0] === 'hex') return fromHex(part[1])
    const file = stock[part[1] as keyof ZoomStock]
    if (!file) throw new Error('A patch copies from ' + part[1] + ', which this build doesn’t read.')
    return file.slice(part[2], part[2] + part[3])
  }))
  for (const patch of patches) {
    if (patch.builds && !patch.builds.includes(build)) throw new Error(patch.name + ': only written for ' + patch.builds.join(', ') + ', not ' + build + '.')
    const own = (entries: Entry[] = []) => entries.filter(entry => entry.model === build)
    let applied = 0
    for (const write of own(patch.write)) {
      if (await sha256(span(img, write.addr!, write.expect_length!)) !== write.expect_sha256) throw new Error(patch.name + ': the bytes at ' + hex(write.addr!) + ' are not the expected ones.')
      const data = bytes(write.data)
      span(img, write.addr!, data.length).set(data)
      applied++
    }
    for (const section of own(patch.section)) {
      addSection(img, section.addr!, bytes(section.data))
      applied++
    }
    for (const logo of own(patch.bin133)) {
      const data = bytes(logo.data), at = logo.offset!
      if (at + data.length > preset.length) throw new Error(patch.name + ': Preset.bin write past its end.')
      if (await sha256(preset.subarray(at, at + data.length)) !== logo.expect_sha256) throw new Error(patch.name + ': Preset.bin bytes at ' + at + ' are not the expected ones.')
      preset.set(data, at)
      applied++
    }
    if (!applied) throw new Error(patch.name + ': nothing applied for ' + build + '.')
  }
  return { main: buildPart(img, stock['Main.bin']), preset: preset.some((b, i) => b !== stock['Preset.bin'][i]) ? preset : undefined }
}

/** The base for the user's own stock MS-70CDR 2.10 parts, from MIDISTOMP's patches by name (a release: MIDISTOMP.releases). */
export async function buildBase(stock: ZoomStock, names: readonly string[]) {
  for (const [file, pin] of [['Main.bin', MIDISTOMP.stock.main], ['Preset.bin', MIDISTOMP.stock.preset]] as const)
    if (stock[file].length !== pin.bytes || await sha256(stock[file]) !== pin.sha256) throw new Error(file + ' isn’t from Zoom’s MS-70CDR 2.10 updater. Choose an unmodified copy.')
  const patches = names.map(name => {
    const patch = MIDISTOMP.patches.find(patch => patch.name === name)
    if (!patch) throw new Error('MIDISTOMP has no patch ' + name + '.')
    return patch
  })
  return applyPatches(stock, patches, MIDISTOMP.build)
}
