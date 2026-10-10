// MIDISC2.0 candidate. Public composition remains behind the catalog's pending gate.
// All inherited instruction/descriptor spans come from the local verified 1.40C.
import { applyGuardedOsWrites, type OsWrite } from './os-patches.ts'
export type MidiScenesPatch = {
  schemaVersion: number; id: string; moduleVersion: string
  upstream: { repository: string; revision: string; path: string; sha256: string }
  osBytes: number; stockSha256: string; mainSha256: string
  writes: { offset: number; bytes: number; guardSha256: string; segments: ({ hex: string } | { stockOffset: number; bytes: number; sha256: string })[] }[]
}
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)), byte => byte.toString(16).padStart(2, '0')).join('')
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const integer = (value: number, minimum: number, maximum: number) => Number.isSafeInteger(value) && value >= minimum && value <= maximum
const keys = (value: object, names: string[]) => Object.keys(value).sort().join(',') === names.sort().join(',')

export function validateMidiScenesPatch(recipe: MidiScenesPatch) {
  if (!recipe || !keys(recipe, ['schemaVersion', 'id', 'moduleVersion', 'upstream', 'osBytes', 'stockSha256', 'mainSha256', 'writes']) || recipe.schemaVersion !== 1 || recipe.id !== 'midi-scenes' || !['0.2.3-experimental', '0.2.4-experimental'].includes(recipe.moduleVersion) || recipe.osBytes !== 1112560 || !digest(recipe.stockSha256) || !digest(recipe.mainSha256) || !Array.isArray(recipe.writes) || !recipe.writes.length || recipe.writes.length > 1024) throw new Error('Invalid MIDISC2.0 source recipe.')
  if (!recipe.upstream || !keys(recipe.upstream, ['repository', 'revision', 'path', 'sha256']) || recipe.upstream.repository !== 'https://github.com/bkkbrls-del/midisc' || recipe.upstream.revision !== '4f9a89453fdcdd39a3cd57f010ffa489cac721cd' || recipe.upstream.path !== 'tools/midisc/release20.json' || recipe.upstream.sha256 !== 'a2dbe20d82de8bd3a4f010c1e94c4b2ebf080ca3f7203521053f747b52dc24a1') throw new Error('MIDISC2.0 provenance does not match the pinned author release.')
  let previousEnd = 0
  for (const row of recipe.writes) {
    if (!row || !keys(row, ['offset', 'bytes', 'guardSha256', 'segments']) || !integer(row.offset, previousEnd, recipe.osBytes - 1) || !integer(row.bytes, 1, recipe.osBytes - row.offset) || !digest(row.guardSha256) || !Array.isArray(row.segments) || !row.segments.length || row.segments.length > 16384) throw new Error('Invalid or overlapping MIDISC2.0 patch region.')
    let count = 0
    for (const segment of row.segments) {
      if (!segment || typeof segment !== 'object') throw new Error('Invalid MIDISC2.0 segment.')
      if ('hex' in segment) {
        if (!keys(segment, ['hex']) || typeof segment.hex !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(segment.hex) || segment.hex.length > row.bytes * 2) throw new Error('Invalid authored MIDISC2.0 segment.')
        count += segment.hex.length / 2
      } else {
        if (!keys(segment, ['stockOffset', 'bytes', 'sha256']) || !integer(segment.stockOffset, 0, recipe.osBytes - 1) || !integer(segment.bytes, 1, recipe.osBytes - segment.stockOffset) || !digest(segment.sha256)) throw new Error('Invalid local-stock MIDISC2.0 reference.')
        count += segment.bytes
      }
    }
    if (count !== row.bytes) throw new Error('MIDISC2.0 segment lengths do not match the patch region.')
    previousEnd = row.offset + row.bytes
  }
}

export const MIDI_SCENES_RELEASE_SHA256 = 'ed7ccf4f9a383caaf3210f526b69fded2384a272670da0a17d0ff87441b622b3'

// Issue #329: stock FUNC+SCENE A/B sets 0x80000006/0x80000007 to 1 and the
// stock morph then ignores that side; MIDISC2.0 never read either flag. The
// crossfader mix, endpoint snapshot and XF cache key now load a muted side's
// scene as unassigned (0xff), so a mute behaves like a blank scene: the
// unlocked side falls back to the trig lock or track value, and with both
// muted every scened CC returns to its base value. When neither side locks a
// parameter the author writes its base value silently; with a mute active it
// now uses the author's send-if-changed path, so muting the last scene sends
// the static CC as stock does. The mix's null scene
// pointer paths loaded -1 rather than the 0xff "no lock" marker; their
// branches now reach stubs that load 0xff. Scene-held edits still read the
// real assignment, as stock does. Helpers and stubs occupy 114 of 116 and 26
// of 140 bytes of two unreferenced 0xff runs inside the author's main cave.
// Mirrors SCENE_MUTE in sdk/octabam/modules/midi-scenes/patch.py.
export const MIDI_SCENES_SCENE_MUTE = [
  { address: 0x400d2928, author: '779073a80001', bytes: '4eb9400d738c', note: 'crossfader mix: jsr ab_d1' },
  { address: 0x400d2984, author: '6700000c', bytes: '67004a64', note: 'mix, no Scene A pointer: beq null_a' },
  { address: 0x400d299e, author: '6700000c', bytes: '67004a54', note: 'mix, no Scene B pointer: beq null_b' },
  { address: 0x400d69d2, author: '67000008', bytes: '67000a9c', note: 'mix, neither side locked: beq unlocked' },
  { address: 0x400d6884, author: '71d0b0ba00cc', bytes: '4eb9400d73c4', note: 'XF cache key: jsr ab_key' },
  { address: 0x400d7092, author: '779079a80001', bytes: '4eb9400d73a8', note: 'crossfader endpoint snapshot: jsr ab_d4' },
  { address: 0x400d738c, author: 'ff'.repeat(116), note: 'scene-mute helpers ab_d1, ab_d4, ab_key, null_a, null_b',
    bytes: '779073a800014a3980000006670250c34a3980000007670250c14e75'
      + '779079a800014a3980000006670250c34a3980000007670250c44e75'
      + '71d04a3980000006670600800000ff004a398000000767060080000000ffb0b9400d69544e75'
      + '760050c34ef9400d2994'
      + '780050c44ef9400d29ae' },
  { address: 0x400d7470, author: 'ff'.repeat(140), note: 'unlocked: send the base value when a scene mute is active',
    bytes: '4a7980000006660c02800000007f4ef9400d2a7e4ef9400d2a9a' },
] as const
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16))

/** Guarded writes that make MIDISC2.0 honour the stock Scene A/B mutes. */
export async function midiScenesSceneMuteWrites(): Promise<OsWrite[]> {
  return Promise.all(MIDI_SCENES_SCENE_MUTE.map(async row => ({ address: row.address, guardLength: row.author.length / 2, guardSha256: await hash(fromHex(row.author)), bytes: fromHex(row.bytes), note: `MIDISC2.0 scene mute: ${row.note}` })))
}

/** Reconstruct the released image: the pinned author image plus the scene-mute fix. */
export async function reconstructMidiScenes(original: Uint8Array, recipe: MidiScenesPatch): Promise<Uint8Array> {
  const result = await applyGuardedOsWrites(await reconstructMidiScenesAuthor(original, recipe), await midiScenesSceneMuteWrites())
  if (await hash(result) !== MIDI_SCENES_RELEASE_SHA256) throw new Error('MIDISC2.0 output differs from the scene-mute release image.')
  return result
}

/** Reconstruct the author's standalone image; no bytes are stored, uploaded or logged. */
export async function reconstructMidiScenesAuthor(original: Uint8Array, recipe: MidiScenesPatch): Promise<Uint8Array> {
  validateMidiScenesPatch(recipe)
  if (original.length !== recipe.osBytes || await hash(original) !== recipe.stockSha256) throw new Error('MIDISC2.0 requires unmodified original OS 1.40C.')
  const result = original.slice()
  for (const row of recipe.writes) {
    if (await hash(original.subarray(row.offset, row.offset + row.bytes)) !== row.guardSha256) throw new Error('MIDISC2.0 stock-site fingerprint differs.')
    let cursor = row.offset
    for (const segment of row.segments) {
      let bytes: Uint8Array
      if ('hex' in segment) bytes = Uint8Array.from(segment.hex.match(/../g)!, value => parseInt(value, 16))
      else {
        bytes = original.subarray(segment.stockOffset, segment.stockOffset + segment.bytes)
        if (await hash(bytes) !== segment.sha256) throw new Error('MIDISC2.0 inherited stock fingerprint differs.')
      }
      result.set(bytes, cursor); cursor += bytes.length
    }
  }
  if (await hash(result) !== recipe.mainSha256) throw new Error('MIDISC2.0 output differs from the pinned author image.')
  return result
}

/** Diagnose composition overlap before allowing a fixed-address release into the remixer. */
export function midiScenesConflicts(original: Uint8Array, composition: Uint8Array, recipe: MidiScenesPatch) {
  validateMidiScenesPatch(recipe)
  if (original.length !== recipe.osBytes || composition.length < recipe.osBytes) throw new Error('Invalid OS extent for MIDISC2.0 compatibility.')
  return recipe.writes.filter(row => original.subarray(row.offset, row.offset + row.bytes).some((byte, index) => composition[row.offset + index] !== byte)).map(row => ({ offset: row.offset, bytes: row.bytes }))
}
