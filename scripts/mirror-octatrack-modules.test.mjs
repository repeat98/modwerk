import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MIRROR, MODULES, mirrorOctatrackModules } from './mirror-octatrack-modules.mjs'

const roots = []
function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-mirror-'))
  roots.push(root)
  mkdirSync(join(root, MODULES, 'demo/media'), { recursive: true })
  mkdirSync(join(root, 'sdk/octabam/tools'), { recursive: true })
  writeFileSync(join(root, MODULES, 'demo/manifest.py'), 'MODULE = 1\n')
  writeFileSync(join(root, MODULES, 'demo/media/a.png'), 'png')
  return root
}
const read = (root, path) => readFileSync(join(root, MIRROR, path), 'utf8')
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('the mirror octabam’s tools read the Octatrack’s modules from', () => {
  it('copies every file once and writes nothing when nothing changed', () => {
    const root = checkout()
    expect(mirrorOctatrackModules(root)).toBe(2)
    expect(read(root, 'demo/manifest.py')).toBe('MODULE = 1\n')
    expect(mirrorOctatrackModules(root)).toBe(0)
  })
  it('follows an edit, a new file, a removed file and a removed module', () => {
    const root = checkout()
    mirrorOctatrackModules(root)
    writeFileSync(join(root, MODULES, 'demo/manifest.py'), 'MODULE = 2\n')
    writeFileSync(join(root, MODULES, 'demo/demo.asm'), ' nop\n')
    rmSync(join(root, MODULES, 'demo/media/a.png'))
    mkdirSync(join(root, MODULES, 'draft')); writeFileSync(join(root, MODULES, 'draft/manifest.py'), 'MODULE = 3\n')
    mirrorOctatrackModules(root)
    expect(read(root, 'demo/manifest.py')).toBe('MODULE = 2\n'); expect(read(root, 'demo/demo.asm')).toBe(' nop\n')
    expect(existsSync(join(root, MIRROR, 'demo/media/a.png'))).toBe(false); expect(read(root, 'draft/manifest.py')).toBe('MODULE = 3\n')
    // A staged draft leaves again, with the bytecode Python wrote beside it.
    mkdirSync(join(root, MIRROR, 'draft/__pycache__')); writeFileSync(join(root, MIRROR, 'draft/__pycache__/manifest.pyc'), '')
    rmSync(join(root, MODULES, 'draft'), { recursive: true })
    mirrorOctatrackModules(root)
    expect(existsSync(join(root, MIRROR, 'draft'))).toBe(false)
  })
  it('refuses to overwrite a file edited in the mirror, and says where the edit belongs', () => {
    const root = checkout()
    mirrorOctatrackModules(root)
    writeFileSync(join(root, MIRROR, 'demo/manifest.py'), 'MODULE = "mine"\n')
    expect(() => mirrorOctatrackModules(root)).toThrow('put your changes there')
    expect(read(root, 'demo/manifest.py')).toBe('MODULE = "mine"\n')
  })
  it('takes over a checkout from before the move: identical files and caches stay or go, someone’s own file is refused', () => {
    const root = checkout()
    mkdirSync(join(root, MIRROR, 'demo/__pycache__'), { recursive: true })
    writeFileSync(join(root, MIRROR, 'demo/manifest.py'), 'MODULE = 1\n'); writeFileSync(join(root, MIRROR, 'demo/__pycache__/manifest.pyc'), '')
    expect(mirrorOctatrackModules(root)).toBe(1)
    mkdirSync(join(root, MIRROR, 'mine')); writeFileSync(join(root, MIRROR, 'mine/manifest.py'), 'MODULE = 9\n')
    expect(() => mirrorOctatrackModules(root)).toThrow('mine/manifest.py')
  })
  it('replaces a link left there by an earlier setup, and says a checkout without the modules is incomplete', () => {
    const root = checkout()
    // Windows needs special rights to make a link; there the folder is simply made.
    if (process.platform !== 'win32') symlinkSync('../octatrack/modules', join(root, MIRROR), 'dir')
    expect(mirrorOctatrackModules(root)).toBe(2)
    expect(read(root, 'demo/manifest.py')).toBe('MODULE = 1\n')
    rmSync(join(root, MODULES), { recursive: true })
    expect(() => mirrorOctatrackModules(root)).toThrow('is missing')
  })
})
