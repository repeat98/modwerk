import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { classifyChanges, readChangeScope } from './change-scope.mjs'

const digi = { id: 'demo', machine: 'digitakt', version: '1.0.0', name: 'Demo', author: { github: 'author' }, maintainers: ['author'],
  source: { revision: 'a'.repeat(40) }, platform: { build: 'build.json' }, compatibility: { releases: ['1.53'] }, claims: {},
  presentation: { summary: 'Summary', usage: ['Step'] }, controls: [], access: {}, tests: {}, media: [] }
const ot = { ...digi, key: 'DEMO', build: { status: 'verified' } }
const modulePath = 'sdk/digitakt/modules/demo/modwerk.module.json'
const change = (path, before = '', after = '') => ({ path, before: typeof before === 'string' || before === null ? before : JSON.stringify(before), after: typeof after === 'string' || after === null ? after : JSON.stringify(after) })
const scope = (...changes) => classifyChanges(changes)

describe('documentation and firmware scheduling', () => {
  it.each(['octabam', 'digitakt', 'digitone'])('skips firmware and app checks for %s prose, screenshots and evidence', machine => {
    const actual = scope(...['README.md', 'media/control.png', 'media/capture.json', 'presentation/thumbnail.svg', 'evidence/report.json'].map(path => change(`sdk/${machine}/modules/demo/${path}`)))
    expect(actual).toEqual({ documentation: true, modules: false, elemod: false, windows: false, worker: false, logger: false })
  })
  it('treats authored changelog data as documentation while retaining app checks for its renderer and validator', () => {
    expect(scope(change('src/community/module-changelogs.json'))).toEqual({ documentation: true, modules: false, elemod: false, windows: false, worker: false, logger: false })
    for (const path of ['src/community/ModuleChangelog.tsx', 'src/community/module-changelogs.ts', 'scripts/module-changelogs.mjs']) {
      expect(scope(change(path))).toEqual({ documentation: false, modules: false, elemod: false, windows: false, worker: false, logger: false })
    }
  })
  it('recognizes manifest/gallery/tutorial edits plus their generated catalog as documentation', () => {
    const updated = { ...digi, presentation: { ...digi.presentation, usage: ['Better tutorial'] }, controls: [{ description: 'Clear label' }], media: [{ path: 'media/control.png' }], tests: { documentation: { tutorial: {} } } }
    const actual = scope(change(modulePath, digi, updated), change('src/catalog/machine-modules.json', { modules: [digi] }, { modules: [updated] }))
    expect(actual.documentation).toBe(true)
    expect(actual.worker).toBe(false)
    expect(actual.elemod).toBe(false)
  })
  it('keeps genuine Worker module fields current without compiling metadata labels', () => {
    const updated = { ...digi, version: '1.0.1', presentation: { summary: 'New summary' } }
    const actual = scope(change(modulePath, digi, updated), change('src/catalog/machine-modules.json', { modules: [digi] }, { modules: [updated] }))
    expect(actual.documentation).toBe(false)
    expect(actual.worker).toBe(true)
    expect(actual.elemod).toBe(false)
    expect(actual.modules).toBe(false)
  })
  it.each(['src/demo.c', 'build.json', 'src/demo.s', 'media/native.c'])('compiles actual Digi firmware input %s', path => {
    const actual = scope(change('sdk/digitakt/modules/demo/' + path))
    expect(actual.elemod).toBe(true)
    expect(actual.modules).toBe(false)
    expect(actual.documentation).toBe(false)
  })
  it.each(['source', 'platform', 'claims', 'compatibility'])('retains compilation for Digi %s changes', key => {
    const actual = scope(change(modulePath, digi, { ...digi, [key]: { changed: true } }))
    expect(actual.elemod).toBe(true)
    expect(actual.documentation).toBe(false)
  })
  it.each(['vendor/elekloader/catalog/catalog.json', 'vendor/elekloader/catalog/digihealth.elemod', 'vendor/elekloader/elekloader.lock.json'])('compiles and checks downloaded native package input %s', path => {
    expect(scope(change(path))).toMatchObject({ elemod: true, documentation: false })
  })
  it('compiles new/removed modules and refuses invalid manifest JSON', () => {
    for (const item of [change(modulePath, null, digi), change(modulePath, digi, null)]) expect(scope(item).elemod).toBe(true)
    expect(() => scope(change(modulePath, '{}', '{'))).toThrow()
  })
  it('preserves OT compiler identity and isolates app/backend edits from firmware compilation', () => {
    const path = 'sdk/octabam/modules/demo/octamod.module.json'
    expect(scope(change(path, ot, { ...ot, presentation: { summary: 'Words' } })).modules).toBe(false)
    expect(scope(change(path, ot, { ...ot, version: '1.0.1' })).modules).toBe(true)
    for (const path of ['src/App.tsx', 'server/api.ts', 'AGENTS.md', 'scripts/change-scope.mjs']) {
      const actual = scope(change(path))
      expect(actual.modules).toBe(false)
      expect(actual.elemod).toBe(false)
    }
    expect(scope(change('server/api.ts')).worker).toBe(true)
    expect(scope(change('src/community/usage-pages.ts')).worker).toBe(true)
    expect(scope(change('src/community/module-release-contract.ts')).worker).toBe(true)
    expect(scope(change('src/community/module-release-notes.ts')).worker).toBe(true)
    expect(scope(change('src/community/profile-links.ts')).worker).toBe(true)
    expect(scope(change('.github/module-authors.json')).worker).toBe(true)
    expect(scope(change('src/devices/DigiModDetail.tsx')).worker).toBe(false)
  })
  it('compares compiler job bodies while ignoring scheduling-only changes', () => {
    const before = 'jobs:\n  elemod-source:\n    needs: old\n    if: old\n    steps:\n      - run: compile old\n  octatrack-source:\n    steps:\n      - run: compile OT\n'
    const scheduling = before.replace('needs: old', 'needs: scope').replace('if: old', 'if: new')
    expect(scope(change('.github/workflows/module-pr.yml', before, scheduling)).elemod).toBe(false)
    expect(scope(change('.github/workflows/module-pr.yml', before, before.replace('compile old', 'compile new'))).elemod).toBe(true)
    expect(scope(change('.github/workflows/module-pr.yml', before, before.replace('compile OT', 'compile changed'))).modules).toBe(true)
    for (const path of ['sdk/build/Dockerfile', 'scripts/build-module-packages.py']) expect(scope(change(path)).modules).toBe(true)
  })
  it('checks OT catalog maps and firmware pins rather than presentation dates', () => {
    const before = { schemaVersion: 1, modules: { demo: digi } }
    const updated = { ...digi, author: { github: 'other' } }
    expect(scope(change('src/catalog/module-documents.json', before, { ...before, modules: { demo: updated } })).worker).toBe(true)
    const catalog = { sourceRevision: 'a', modules: [{ id: 'demo', version: '1.0.0', addedAt: 'old' }] }
    expect(scope(change('sdk/catalog.json', catalog, { ...catalog, modules: [{ ...catalog.modules[0], addedAt: 'new' }] })).modules).toBe(false)
    expect(scope(change('sdk/catalog.json', catalog, { ...catalog, modules: [{ ...catalog.modules[0], version: '1.0.1' }] })).modules).toBe(true)
  })
  it('uses actual Git trees, additions, removals and untracked local edits; invalid bases fail closed', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'modwerk-scope.'))
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    try {
      git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com')
      writeFileSync(resolve(root, 'README.md'), 'Old'); git('add', '.'); git('commit', '-m', 'base')
      const base = git('rev-parse', 'HEAD')
      writeFileSync(resolve(root, 'README.md'), 'Better'); git('add', '.'); git('commit', '-m', 'docs')
      expect(readChangeScope({ root, base, head: 'HEAD' }).documentation).toBe(true)
      mkdirSync(resolve(root, 'sdk/digitakt/modules/demo/src'), { recursive: true })
      writeFileSync(resolve(root, 'sdk/digitakt/modules/demo/src/demo.c'), 'void demo(void) {}')
      expect(readChangeScope({ root, base }).elemod).toBe(true)
      git('add', '.'); git('commit', '-m', 'code')
      const code = git('rev-parse', 'HEAD'); rmSync(resolve(root, 'sdk/digitakt/modules/demo/src/demo.c'))
      expect(readChangeScope({ root, base: code }).elemod).toBe(true)
      expect(() => readChangeScope({ root, base: 'missing-ref' })).toThrow()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
