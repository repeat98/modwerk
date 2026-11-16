import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { requireDistinctZdl, requireZdlBinary, unlistedZdl, zdlPath } from './zdl-binaries.mjs'

// An effect file's header as the pedal reads it: group at 0x3C, ID at 0x40, version at 0x44 (zoom-protocol.ts effectInfo).
function effectFile(gid, fxid, version, size = 400) {
  const data = new Uint8Array(size).map((_, i) => (i * 13) & 0xff)
  data.set(new TextEncoder().encode('SIZE'), 4)
  data[0x3c] = gid; data[0x40] = fxid & 0xff; data[0x41] = fxid >> 8
  data.set(new TextEncoder().encode(version), 0x44)
  data[0x4c] = 0x7f; data.set(new TextEncoder().encode('ELF'), 0x4d)
  return data
}
const effect = (id, file, fxid, data) => ({ id, version: '0.1.0', platform: { file, effectId: { gid: 8, fxid }, effectVersion: '0.03', binary: { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length } } })
function repo(...modules) {
  const root = mkdtempSync(join(tmpdir(), 'zdl-binaries-'))
  for (const [document, data] of modules) { const path = join(root, zdlPath(document)); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, data) }
  return root
}

describe('Zoom effect files in public/zoom-effects', () => {
  it('holds each file to its pin and its header to the manifest', () => {
    const data = effectFile(8, 467, '0.03'), loop = effect('loop', 'Loop.ZDL', 467, data), root = repo([loop, data])
    expect(() => requireZdlBinary(root, 'zoom/loop', loop)).not.toThrow()
    expect(() => requireZdlBinary(root, 'zoom/loop', { ...loop, version: '0.2.0' })).toThrow('npm run zdl:vendor -- loop')
    expect(() => requireZdlBinary(root, 'zoom/loop', { ...loop, platform: { ...loop.platform, binary: { ...loop.platform.binary, sha256: 'b'.repeat(64) } } })).toThrow('not the pinned release file')
    expect(() => requireZdlBinary(root, 'zoom/loop', { ...loop, platform: { ...loop.platform, effectId: { gid: 8, fxid: 468 } } })).toThrow('header names 8/467')
  })
  it('keeps names and effect IDs apart, and finds files no module names', () => {
    const a = effectFile(8, 467, '0.03'), b = effectFile(8, 468, '0.03')
    expect(() => requireDistinctZdl([effect('loop', 'Loop.ZDL', 467, a), effect('scope', 'Scope.ZDL', 468, b)])).not.toThrow()
    expect(() => requireDistinctZdl([effect('loop', 'Loop.ZDL', 467, a), effect('other', 'LOOP.ZDL', 468, b)])).toThrow('same file LOOP.ZDL')
    expect(() => requireDistinctZdl([effect('loop', 'Loop.ZDL', 467, a), effect('other', 'Other.ZDL', 467, b)])).toThrow('same effect ID 8/467')
    const loop = effect('loop', 'Loop.ZDL', 467, a), root = repo([loop, a], [{ ...loop, version: '0.0.9' }, a])
    expect(() => unlistedZdl(root, [loop])).toThrow('zoom-effects/loop/0.0.9/Loop.ZDL: no Zoom effect module names this')
    expect(() => unlistedZdl(root, [loop, { ...loop, version: '0.0.9' }])).not.toThrow()
  })
})
