import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyChanges, isVersionNeutralChange, reachesSdkSuite, readChangeScope } from './change-scope.mjs'

const digi = { id: 'demo', machine: 'digitakt', version: '1.0.0', name: 'Demo', author: { github: 'author' }, maintainers: ['author'],
  source: { revision: 'a'.repeat(40) }, platform: { build: 'build.json' }, compatibility: { releases: ['1.53'] }, claims: {},
  presentation: { summary: 'Summary', usage: ['Step'] }, controls: [], access: {}, tests: {}, media: [] }
const ot = { ...digi, key: 'DEMO', build: { status: 'verified' } }
const modulePath = 'sdk/digitakt/modules/demo/modwerk.module.json'
const change = (path, before = '', after = '') => ({ path, before: typeof before === 'string' || before === null ? before : JSON.stringify(before), after: typeof after === 'string' || after === null ? after : JSON.stringify(after) })
const scope = (...changes) => classifyChanges(changes)
const repository = fileURLToPath(new URL('..', import.meta.url))

describe('documentation and firmware scheduling', () => {
  it.each(['scripts/frontend-mcp.mjs', 'scripts/frontend-mcp-private-host.mjs', 'sdk/tests/test_frontend_mcp_host.py'])('checks actual native Windows MCP refusal for %s without firmware compilation', path => {
    expect(scope(change(path))).toMatchObject({ documentation: false, windows: true, modules: false, elemod: false })
  })
  it.each(['scripts/prepare-runtime-spans.py', 'scripts/runtime_private_paths.py', 'sdk/tests/test_runtime_spans.py'])('runs native Windows privacy checks for %s without firmware compilation', path => {
    expect(scope(change(path))).toMatchObject({ documentation: false, windows: true, modules: false, elemod: false })
  })
  it.each(['octabam', 'digitakt', 'digitone', 'analog-rytm-mkii'])('skips firmware and app checks for %s prose, screenshots and evidence', machine => {
    const actual = scope(...['README.md', 'media/control.png', 'media/capture.json', 'presentation/thumbnail.svg', 'evidence/report.json'].map(path => change(`sdk/${machine}/modules/demo/${path}`)))
    expect(actual).toEqual({ documentation: true, modules: false, elemod: false, windows: false, worker: false, logger: false })
  })
  it('treats authored changelog data as documentation while retaining app checks for its renderer and validator', () => {
    expect(scope(change('src/community/module-changelogs/euclid.json'))).toEqual({ documentation: true, modules: false, elemod: false, windows: false, worker: false, logger: false })
    for (const path of ['src/community/ModuleChangelog.tsx', 'scripts/module-changelogs.mjs']) {
      expect(scope(change(path))).toEqual({ documentation: false, modules: false, elemod: false, windows: false, worker: false, logger: false })
    }
    // The Worker compiles the changelog loader for module release dates.
    expect(scope(change('src/community/module-changelogs.ts')).worker).toBe(true)
  })
  it('recognizes manifest/gallery/tutorial edits as documentation', () => {
    const updated = { ...digi, presentation: { ...digi.presentation, usage: ['Better tutorial'] }, controls: [{ description: 'Clear label' }], media: [{ path: 'media/control.png' }], tests: { documentation: { tutorial: {} } } }
    const actual = scope(change(modulePath, digi, updated))
    expect(actual.documentation).toBe(true)
    expect(actual.worker).toBe(false)
    expect(actual.elemod).toBe(false)
  })
  it('keeps genuine Worker module fields current without compiling metadata labels', () => {
    const updated = { ...digi, version: '1.0.1', presentation: { summary: 'New summary' } }
    const actual = scope(change(modulePath, digi, updated))
    expect(actual.documentation).toBe(false)
    expect(actual.worker).toBe(true)
    expect(actual.elemod).toBe(false)
    expect(actual.modules).toBe(false)
    expect(scope(change(modulePath, null, digi)).worker).toBe(true)
  })
  it.each(['src/demo.c', 'build.json', 'src/demo.s', 'media/native.c'])('compiles actual Digi firmware input %s', path => {
    const actual = scope(change('sdk/digitakt/modules/demo/' + path))
    expect(actual.elemod).toBe(true)
    expect(actual.modules).toBe(false)
    expect(actual.documentation).toBe(false)
  })
  it.each(['src/demo.s', 'build.json', 'include/demo.inc'])('compiles Analog Rytm MKII firmware input %s', path => {
    const actual = scope(change('sdk/analog-rytm-mkii/modules/demo/' + path))
    expect(actual.elemod).toBe(true)
    expect(actual.modules).toBe(false)
    expect(actual.documentation).toBe(false)
  })
  it.each(['source', 'platform', 'claims', 'compatibility'])('retains compilation for Digi %s changes', key => {
    const actual = scope(change(modulePath, digi, { ...digi, [key]: { changed: true } }))
    expect(actual.elemod).toBe(true)
    expect(actual.documentation).toBe(false)
  })
  it.each(['vendor/elekloader/upstream-catalog.json', 'sdk/imports/elekloader-digihealth-2026-10-14.json', 'vendor/elekloader/catalog/digihealth.elemod', 'vendor/elekloader/elekloader.lock.json'])('compiles and checks downloaded native package input %s', path => {
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
    expect(scope(change('src/support.ts')).worker).toBe(true)
    expect(scope(change('.github/module-authors.json')).worker).toBe(true)
    expect(scope(change('src/devices/DigiModDetail.tsx')).worker).toBe(false)
  })
  it('redeploys the Worker for every file it compiles', () => {
    const sources = new Set(), queue = [resolve(repository, 'worker.ts')]
    while (queue.length) {
      const file = queue.pop()
      if (sources.has(file)) continue
      sources.add(file)
      if (!/\.tsx?$/.test(file)) continue
      for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(file), spec)
        const found = [target, target + '.ts', target + '/index.ts'].find(path => existsSync(path) && statSync(path).isFile())
        if (found) queue.push(found)
      }
    }
    const paths = [...sources].map(file => relative(repository, file).replaceAll('\\', '/'))
    expect(paths.length).toBeGreaterThan(100)
    // Generated catalogs are compared field by field, and authored changelog prose deliberately skips the deploy.
    const missed = paths.filter(path => !['src/catalog/module-documents.json', 'src/catalog/machine-modules.json', 'src/community/module-changelogs.json'].includes(path) && !scope(change(path, readFileSync(resolve(repository, path), 'utf8'), readFileSync(resolve(repository, path), 'utf8'))).worker)
    expect(missed).toEqual([])
  })
  it('never treats an empty change set as documentation only', () => {
    expect(scope().documentation).toBe(false)
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

describe('SDK suite reach', () => {
  it.each(['src/components/ModuleCard.tsx', 'src/community/Forum.tsx', 'src/hooks/useSheetFocus.ts', 'src/App.tsx', 'src/styles.css',
    'src/routing.test.ts', 'server/community/routes.ts', 'worker.ts', 'changelog/2026-10-26-forum.md', 'docs/APP_DEVELOPMENT.md'])('skips the SDK suite locally for %s', path => {
    expect(reachesSdkSuite(path)).toBe(false)
  })
  it.each(['sdk/tests/test_base_bound.py', 'src/engine/rom-package.ts', 'src/catalog/modules.ts', 'src/config/usb-audio.ts',
    'src/community/module-changelogs.json', 'src/community/module-release-notes.ts', 'src/routing.ts', 'scripts/module-pairs.py',
    'public/octatrack-modules/euclid/0.1.4-experimental.mwrm', 'docs/media/startup/verification.json', 'package-lock.json'])('runs the SDK suite for %s', path => {
    expect(reachesSdkSuite(path)).toBe(true)
  })
  it('runs it for every site path the suite itself names', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--', 'sdk', 'scripts/*.py', 'scripts/octatrack-module-page.mjs', 'scripts/sdk-imports.mjs'], { cwd: repository, encoding: 'utf8' })
      .split('\0').filter(path => /\.(py|sh|mjs|cpp|c|h)$/.test(path))
    const named = files.flatMap(path => [...readFileSync(resolve(repository, path), 'utf8').matchAll(/(?<![\w./-])(?:src|server|changelog)\/[\w./-]+|(?<![\w./-])worker\.ts\b/g)].map(match => match[0]))
    expect(named.length).toBeGreaterThan(0)
    expect([...new Set(named)].filter(path => !reachesSdkSuite(path))).toEqual([])
  })
  it('reports the reach of local edits and runs the suite when nothing changed', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'modwerk-scope.'))
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    try {
      git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com')
      mkdirSync(resolve(root, 'src/components'), { recursive: true }); mkdirSync(resolve(root, 'sdk/tests'), { recursive: true })
      writeFileSync(resolve(root, 'src/components/Card.tsx'), 'old'); git('add', '.'); git('commit', '-m', 'base')
      const base = git('rev-parse', 'HEAD')
      expect(readChangeScope({ root, base }).sdk).toBe(true)
      writeFileSync(resolve(root, 'src/components/Card.tsx'), 'new')
      expect(readChangeScope({ root, base }).sdk).toBe(false)
      writeFileSync(resolve(root, 'sdk/tests/test_new.py'), 'untracked')
      expect(readChangeScope({ root, base }).sdk).toBe(true)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe('module version rule', () => {
  const flagged = { ...digi, compatibility: { ...digi.compatibility, conflicts: ['other'] } }
  it('needs no new Digitakt version for a conflict flag, yet still runs the full checks', () => {
    expect(isVersionNeutralChange(change(modulePath, { ...digi, compatibility: { ...digi.compatibility, conflicts: [] } }, flagged))).toBe(true)
    expect(scope(change(modulePath, { ...digi, compatibility: { ...digi.compatibility, conflicts: [] } }, flagged)).documentation).toBe(false)
  })
  it('still needs one for any other compatibility or code change', () => {
    expect(isVersionNeutralChange(change(modulePath, flagged, { ...flagged, compatibility: { ...flagged.compatibility, releases: ['1.53', '1.54'] } }))).toBe(false)
    expect(isVersionNeutralChange(change(modulePath, flagged, { ...flagged, platform: { build: 'other.json' } }))).toBe(false)
    expect(isVersionNeutralChange(change('sdk/digitakt/modules/demo/src/demo.c'))).toBe(false)
  })
})

describe('release export reproduction', () => {
  it.each(['scripts/package-elemod-recipe.mjs', 'scripts/verify-elemod-release-exports.mjs'])('recompiles the elemod sources for %s', path =>
    expect(scope(change(path)).elemod).toBe(true))
})
