import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dev = (...args) => spawnSync(process.execPath, ['scripts/module-dev.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 120_000 })
const python = process.platform === 'win32' ? 'python' : 'python3'
// The builds need what CI's quick check does not install: Elekloader's checkout (npm run upstream:tools) and Octabam's dsp_asm.
const upstream = join(homedir(), '.cache/modwerk-upstream')
const tools = existsSync(join(upstream, 'elekloader/elekloader')) && existsSync(process.env.ELEKLOADER_DSP_ASM ?? join(upstream, 'octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm'))
const published = id => JSON.parse(readFileSync(join(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8')).packages.find(row => row.id === id)

describe('module:dev', () => {
  it('refuses a missing or malformed id, and a draft that shadows a listed module, before it stages or builds anything', () => {
    expect(dev().status).toBe(2)
    expect(dev('../escape').status).toBe(2)
    const missing = dev('no-such-module', '--build-only')
    expect(missing.status).toBe(2)
    expect(missing.stderr).toContain('npm run module:new')
    // midi-scenes is listed, and its next version is a draft: staging the draft would hide the listed folder.
    const both = dev('midi-scenes', '--build-only')
    expect(both.status).toBe(2)
    expect(both.stderr).toContain('--listed')
  })

  // A listed DSP effect built by module:dev is the package the site ships, byte for byte: same builder, figures and page.
  it.skipIf(!tools)('builds a listed effect exactly as the site publishes it', () => {
    const out = mkdtempSync(join(tmpdir(), 'modwerk-dev-test.'))
    try {
      const file = join(out, 'miniverb.mwrm'), result = dev('miniverb', '--build-only', '--out', file)
      expect(result.status, result.stderr).toBe(0)
      expect(readFileSync(file).equals(readFileSync(join(root, 'public', published('miniverb').path)))).toBe(true)
    } finally { rmSync(out, { recursive: true, force: true }) }
  }, 120_000)

  // A draft has no committed page recipe, so module-dev-package.py derives one from its manifest. Derived for listed effects, it must
  // equal their committed recipes, and its packing must equal build.py's.
  it.skipIf(!tools)('derives and packs an effect page exactly as the catalogue build and build.py do', () => {
    for (const id of ['airwindows-chorus', 'miniverb', 'spectrum', 'everb', 'lofi2']) {
      const result = spawnSync(python, ['-B', 'scripts/module-dev-package.py', id, '-o', '/dev/null', '--check-page', id], { cwd: root, encoding: 'utf8' })
      expect(result.stdout.trim().split('\n').at(-1), id + ': ' + result.stderr).toBe('packing identical recipe identical')
    }
  }, 120_000)
})
