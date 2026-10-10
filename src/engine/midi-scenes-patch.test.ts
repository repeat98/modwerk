import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import raw from '../../sdk/drafts/midi-scenes/recipe.json'
import { MIDI_SCENES_SCENE_MUTE, midiScenesConflicts, midiScenesSceneMuteWrites, reconstructMidiScenes, reconstructMidiScenesAuthor, validateMidiScenesPatch, type MidiScenesPatch } from './midi-scenes-patch'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS } from './os-patches'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const candidate = raw as MidiScenesPatch

function synthetic() {
  // Synthetic OS-shaped bytes only; ordinary checks never read real firmware.
  const original = new Uint8Array(1112560)
  const output = original.slice(); output.set([1, 2, 0], 100)
  const recipe: MidiScenesPatch = { ...structuredClone(candidate), stockSha256: sha(original), mainSha256: sha(output), writes: [{ offset: 100, bytes: 3, guardSha256: sha(original.slice(100, 103)), segments: [{ hex: '0102' }, { stockOffset: 10, bytes: 1, sha256: sha(new Uint8Array(1)) }] }] }
  return { original, output, recipe }
}

describe('MIDISC2.0 stock-free candidate', () => {
  it('pins the new author recipe and retains inherited spans as references', () => {
    expect(() => validateMidiScenesPatch(candidate)).not.toThrow()
    expect(candidate.mainSha256).toBe('debb24090cada4be00bc70880136f14e813b0d3a9018b516f922d33671bd9b87')
    expect(candidate.writes).toHaveLength(85)
    const segments = candidate.writes.flatMap(row => row.segments)
    expect(segments.reduce((total, row) => total + ('hex' in row ? row.hex.length / 2 : 0), 0)).toBe(5848)
    expect(segments.reduce((total, row) => total + ('stockOffset' in row ? row.bytes : 0), 0)).toBe(3179)
  })
  it('reconstructs without changing the input, and checks every guard and the final output', async () => {
    const { original, output, recipe } = synthetic()
    // Hash comparison avoids a million-element assertion walk on shared CI runners.
    expect(sha(await reconstructMidiScenesAuthor(original, recipe))).toBe(sha(output))
    expect(original.some(Boolean)).toBe(false)
    const altered = original.slice(); altered[12] = 1
    await expect(reconstructMidiScenesAuthor(altered, recipe)).rejects.toThrow('unmodified')
    for (const modify of [
      (r: MidiScenesPatch) => { r.writes[0].guardSha256 = '0'.repeat(64) },
      (r: MidiScenesPatch) => { const copy = r.writes[0].segments[1]; if ('stockOffset' in copy) copy.sha256 = '0'.repeat(64) },
      (r: MidiScenesPatch) => { r.writes[0].segments[0] = { hex: '0304' } },
    ]) {
      const changed = structuredClone(recipe); modify(changed)
      await expect(reconstructMidiScenesAuthor(original, changed)).rejects.toThrow(/fingerprint|pinned author image/)
    }
  })
  it('rejects malformed recipes, out-of-bounds references, and overlapping writes', () => {
    const { recipe } = synthetic()
    for (const change of [
      (r: MidiScenesPatch) => { r.writes.push(structuredClone(r.writes[0])) },
      (r: MidiScenesPatch) => { r.writes[0].bytes++ },
      (r: MidiScenesPatch) => { r.writes[0].segments[0] = { hex: '1' } },
      (r: MidiScenesPatch) => { r.writes[0].segments[1] = { stockOffset: r.osBytes, bytes: 1, sha256: '0'.repeat(64) } },
      (r: MidiScenesPatch) => { r.upstream.revision = '0'.repeat(40) },
    ]) {
      const changed = structuredClone(recipe); change(changed)
      expect(() => validateMidiScenesPatch(changed)).toThrow()
    }
  })
  it('identifies a remixer write touching the author patch without treating unrelated writes as conflicts', () => {
    const { original, recipe } = synthetic()
    const unrelated = original.slice(); unrelated[50] = 1
    expect(midiScenesConflicts(original, unrelated, recipe)).toEqual([])
    unrelated[101] = 1
    expect(midiScenesConflicts(original, unrelated, recipe)).toEqual([{ offset: 100, bytes: 3 }])
  })
  it('treats a muted scene as blank only at the author crossfader sites', async () => {
    // Synthetic author-shaped image: only the guarded author bytes are present.
    const author = new Uint8Array(1112560)
    const hex = (value: string) => Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16))
    for (const row of MIDI_SCENES_SCENE_MUTE) author.set(hex(row.author), row.address - OS_LOAD_ADDRESS)
    const fixed = await applyGuardedOsWrites(author, await midiScenesSceneMuteWrites())
    for (const row of MIDI_SCENES_SCENE_MUTE) {
      const at = row.address - OS_LOAD_ADDRESS
      expect(Buffer.from(fixed.subarray(at, at + row.bytes.length / 2)).toString('hex')).toBe(row.bytes)
    }
    // Every site calls or branches into a reclaimed padding run; the helpers fit them.
    const caves = MIDI_SCENES_SCENE_MUTE.filter(row => /^(ff)+$/.test(row.author))
    expect(caves).toHaveLength(2)
    for (const cave of caves) expect(cave.bytes.length / 2).toBeLessThanOrEqual(cave.author.length / 2)
    const sites = MIDI_SCENES_SCENE_MUTE.filter(row => !caves.includes(row))
    expect(sites).toHaveLength(6)
    for (const row of sites) {
      const opcode = row.bytes.slice(0, 4)
      expect(['4eb9', '6700']).toContain(opcode)
      // jsr abs.l, or beq.w with a displacement from the extension word.
      const target = opcode === '4eb9' ? parseInt(row.bytes.slice(4), 16) : row.address + 2 + parseInt(row.bytes.slice(4), 16)
      expect(caves.some(cave => target >= cave.address && target < cave.address + cave.bytes.length / 2)).toBe(true)
    }
    // Helpers read only the stock Scene A/B mute bytes.
    const helpers = caves.map(cave => cave.bytes).join('')
    expect(helpers.match(/4a3980000006/g)).toHaveLength(3)
    expect(helpers.match(/4a3980000007/g)).toHaveLength(3)
    expect(helpers.match(/4a7980000006/g)).toHaveLength(1)
    expect(author.some(Boolean)).toBe(true)
    const drifted = author.slice(); drifted[0x400d2928 - OS_LOAD_ADDRESS] ^= 1
    await expect(applyGuardedOsWrites(drifted, await midiScenesSceneMuteWrites())).rejects.toThrow('scene mute')
  })
  it('refuses a release reconstruction whose author image lacks the scene-mute sites', async () => {
    const { original, recipe } = synthetic()
    await expect(reconstructMidiScenes(original, recipe)).rejects.toThrow('scene mute')
  })
})
