import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mergeStaticDspMetadata, refreshStaticDspMetadata } from './module-verify-metadata.mjs'

const old = { id: 'old-insert', key: 'OLD_INSERT', fxId: 10, priority: 15 }
const added = { id: 'new-insert', key: 'NEW_INSERT', fxId: 30, priority: 15 }
const facts = modules => ({ schema: 1, revision: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), noneId: 0, modules, customIds: [10, ...(modules.length > 1 ? [30] : [])], payloads: [{ core: 0, tag: 'A', nullInit: 100, nullProc: 101 }, { core: 1, tag: 'B', nullInit: 200, nullProc: 201 }] })

describe('static facts refresh before module verification', () => {
  it('adds the verified insert in native catalog order without changing either input', () => {
    const committed = facts([old]), native = facts([old, added])
    committed.customIds = [6, 10]
    const before = JSON.stringify(committed)
    const merged = mergeStaticDspMetadata(committed, native, added.id)
    expect(merged).toEqual(native)
    expect(merged.modules.map(row => row.id)).toEqual(['old-insert', 'new-insert'])
    expect(merged.customIds).toEqual([10, 30])
    expect(JSON.stringify(committed)).toBe(before)
    expect(native).toEqual(facts([old, added]))
  })

  it('requires manual review for changed stock geometry, source identity or another module', () => {
    const committed = facts([old])
    for (const edit of [
      { sourceSha256: 'c'.repeat(64) }, { noneId: 1 },
      { payloads: [{ core: 0, tag: 'A', nullInit: 102, nullProc: 103 }] },
    ]) expect(() => mergeStaticDspMetadata(committed, { ...facts([old, added]), ...edit }, added.id)).toThrow('shared builder change')
    expect(() => mergeStaticDspMetadata(committed, facts([{ ...old, priority: 16 }, added]), added.id)).toThrow('other modules differ')
    expect(() => mergeStaticDspMetadata(committed, { ...facts([old, added]), hardware: 'verified' }, added.id)).toThrow('Invalid static DSP metadata shape')
  })

  it('awaits the guarded vendored exporter before the chooser reads its cached JSON', async () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-static-facts-'))
    const run = join(root, 'private-run'), assets = join(root, 'src/engine/assets')
    mkdirSync(run); mkdirSync(assets, { recursive: true })
    const path = join(assets, 'static-dsp.json')
    writeFileSync(path, JSON.stringify(facts([old])))
    // A synthetic chooser fixture uses the same ESM JSON caching semantics as
    // choosers.ts. No production composer, firmware or native code executes.
    const chooser = join(assets, 'chooser.mjs')
    writeFileSync(chooser, "import facts from './static-dsp.json' with { type: 'json' };export const ids=facts.modules.map(row=>row.id)\n")
    let calls = 0
    try {
      await refreshStaticDspMetadata({ id: added.id, root, run, containerRun: '/native/runs/unit-test', container: async (name, command) => {
        expect(name).toBe('static DSP metadata')
        expect(command).toEqual(['python3', '-B', '/app/scripts/export-static-dsp.py', '/native/octabam', '/native/runs/unit-test/static-dsp.json', '--app', '/app', '--vendored-sdk'])
        expect(JSON.parse(readFileSync(path, 'utf8')).modules).toEqual([old])
        await Promise.resolve()
        writeFileSync(join(run, 'static-dsp.json'), JSON.stringify(facts([old, added])))
        calls++
      } })
      const loaded = await import(pathToFileURL(chooser).href)
      expect(calls).toBe(1)
      expect(loaded.ids).toEqual(['old-insert', 'new-insert'])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('leaves committed facts intact when the exporter refuses its source or OS guard', async () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-static-guard-'))
    const assets = join(root, 'src/engine/assets'); mkdirSync(assets, { recursive: true })
    const path = join(assets, 'static-dsp.json'), original = JSON.stringify(facts([old]))
    writeFileSync(path, original)
    try {
      await expect(refreshStaticDspMetadata({ id: added.id, root, run: join(root, 'unused'), containerRun: '/native/runs/unit-test', container: async () => { throw new Error('Original OS fingerprint mismatch') } })).rejects.toThrow('Original OS fingerprint mismatch')
      expect(readFileSync(path, 'utf8')).toBe(original)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
