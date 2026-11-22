import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { publishedElemodRollback } from './published-elemod-rollback.mjs'
import { readVendoredElekloader } from './elekloader-vendor.ts'

vi.mock('./elekloader-vendor.ts', () => ({ readVendoredElekloader: vi.fn() }))
const folder = 'sdk/analog-rytm-mkii/modules/example/'
const document = { machine: 'analog-rytm-mkii', id: 'example', version: '1.0.0' }
const pin = { device: 'analog-rytm-mk2', id: 'example', version: '1.0.0', file: 'example.elemod', sha256: 'a'.repeat(64) }
let root
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); rmSync(root, { recursive: true, force: true }) })

function fixture() {
  root = mkdtempSync(join(tmpdir(), 'modwerk-published-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  mkdirSync(join(root, folder), { recursive: true })
  writeFileSync(join(root, folder, 'modwerk.module.json'), JSON.stringify(document))
  writeFileSync(join(root, folder, 'source.c'), 'published')
  git('init', '--quiet')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'published')
  const published = git('rev-parse', 'HEAD')
  const run = { repository: { full_name: 'repeat98/modwerk' }, path: '.github/workflows/pages.yml',
    head_branch: 'main', conclusion: 'success', head_sha: published }
  const live = { mods: [pin] }
  vi.stubGlobal('fetch', vi.fn(async url => Response.json(url.startsWith('https://api.github.com/') ? { workflow_runs: [run] } : live)))
  readVendoredElekloader.mockResolvedValue({ catalog: { mods: [pin] } })
  return { verify: () => publishedElemodRollback(root, published)(document, folder), live, run }
}

it('accepts the published module and verified pins, including when the working tree restores the files', async () => {
  const { verify } = fixture()
  await expect(verify()).resolves.toBeUndefined()
  writeFileSync(join(root, folder, 'source.c'), 'changed')
  await expect(verify()).rejects.toThrow('module files')
  writeFileSync(join(root, folder, 'source.c'), 'published')
  writeFileSync(join(root, folder, 'extra.c'), 'unexpected')
  await expect(verify()).rejects.toThrow('module files')
})

it('requires all live package pins and the same version and bytes', async () => {
  const { verify, live } = fixture()
  for (const mods of [[], [{ ...pin, version: '0.9.0' }], [{ ...pin, sha256: 'b'.repeat(64) }], [pin, { ...pin, file: 'other.elemod' }]]) {
    live.mods = mods
    await expect(verify()).rejects.toThrow('every package')
  }
  readVendoredElekloader.mockRejectedValue(new Error('not the pinned file'))
  await expect(verify()).rejects.toThrow('not the pinned file')
})

it('fails closed when published history or live metadata is unavailable', async () => {
  const { verify, run } = fixture()
  run.conclusion = 'failure'
  await expect(verify()).rejects.toThrow('successful production')
  fetch.mockResolvedValue(new Response(null, { status: 503 }))
  await expect(verify()).rejects.toThrow('HTTP 503')
})
