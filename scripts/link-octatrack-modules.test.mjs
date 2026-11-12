import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LINK, MODULES, linkOctatrackModules } from './link-octatrack-modules.mjs'

const roots = []
function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-link-'))
  roots.push(root)
  mkdirSync(join(root, MODULES, 'demo'), { recursive: true })
  mkdirSync(join(root, 'sdk/octabam/tools'), { recursive: true })
  writeFileSync(join(root, MODULES, 'demo/manifest.py'), 'MODULE = 1\n')
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('the link octabam’s tools find the Octatrack’s modules by', () => {
  it('is made once, shows the real files and is left alone after', () => {
    const root = checkout()
    expect(linkOctatrackModules(root)).toBe('made')
    expect(readFileSync(join(root, LINK, 'demo/manifest.py'), 'utf8')).toBe('MODULE = 1\n')
    expect(linkOctatrackModules(root)).toBe('kept')
  })
  it('replaces what a checkout from before the move leaves behind: empty folders and bytecode caches', () => {
    const root = checkout()
    mkdirSync(join(root, LINK, 'demo/__pycache__'), { recursive: true })
    writeFileSync(join(root, LINK, 'demo/__pycache__/manifest.cpython-312.pyc'), '')
    expect(linkOctatrackModules(root)).toBe('remade')
    expect(readFileSync(join(root, LINK, 'demo/manifest.py'), 'utf8')).toBe('MODULE = 1\n')
  })
  it('refuses to replace a folder that holds someone’s files, and says where they belong', () => {
    const root = checkout()
    mkdirSync(join(root, LINK, 'mine'), { recursive: true })
    writeFileSync(join(root, LINK, 'mine/manifest.py'), 'MODULE = 2\n')
    expect(() => linkOctatrackModules(root)).toThrow('The modules moved to ' + MODULES)
    expect(readFileSync(join(root, LINK, 'mine/manifest.py'), 'utf8')).toBe('MODULE = 2\n')
  })
  it('says a checkout without the modules is incomplete', () => {
    const root = checkout()
    rmSync(join(root, MODULES), { recursive: true })
    expect(() => linkOctatrackModules(root)).toThrow('is missing')
  })
})
