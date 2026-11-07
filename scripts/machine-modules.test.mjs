import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { requireNoSubmissions, requireOriginalThumbnail } from './machine-modules.mjs'

it('refuses a new or changed submission and lets one move into the library', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'modwerk-submissions.'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  const put = (path, text = 'x\n') => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), text) }
  try {
    put('sdk/analog-rytm-mkii/modules/_submissions/old/README.md')
    git('init', '--quiet')
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'base')
    const base = git('rev-parse', 'HEAD').trim(), check = () => requireNoSubmissions(root, base)
    check()
    put('sdk/digitakt-ii/modules/_submissions/new/README.md')
    expect(check).toThrow('sdk/digitakt-ii/modules/_submissions/new/README.md: _submissions/ takes no new modules')
    rmSync(resolve(root, 'sdk/digitakt-ii'), { recursive: true })
    put('sdk/analog-rytm-mkii/modules/_submissions/old/README.md', 'changed\n')
    expect(check).toThrow('_submissions/old/README.md')
    git('mv', 'sdk/analog-rytm-mkii/modules/_submissions/old', 'sdk/analog-rytm-mkii/modules/old')
    check()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('refuses the SDK template\'s placeholder thumbnail in a library module', () => {
  const template = new URL('../sdk/templates/elemod/', import.meta.url)
  const svg = readFileSync(new URL('media/thumbnail.svg', template), 'utf8')
  const item = JSON.parse(readFileSync(new URL('modwerk.module.json', template), 'utf8')).media.find(entry => entry.kind === 'thumbnail')
  const original = { ...item, source: 'Original conceptual illustration in the shared signal-art style; not a device screenshot.' }
  expect(() => requireOriginalThumbnail('rytm/x', item, svg)).toThrow('rytm/x: media/thumbnail.svg is still the SDK template\'s placeholder thumbnail')
  expect(() => requireOriginalThumbnail('rytm/x', original, svg)).toThrow('placeholder thumbnail')
  expect(() => requireOriginalThumbnail('rytm/x', item, '<svg/>')).toThrow('placeholder thumbnail')
  requireOriginalThumbnail('rytm/x', original, '<svg><text>FIX</text></svg>')
})
