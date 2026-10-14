import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { inspectAuthorUpdate } from './author-update-git.mjs'
import { fetchReleaseApproval } from './release-approval.mjs'
import { ACTIONS_BOT_ID, AUTHOR_RELEASE_EVIDENCE, AUTHOR_RELEASE_REQUEST } from '../src/release/author-updates.ts'

const roots = [], ownerId = 67785539, author = { login: 'devilfish707', id: 86663946, type: 'User' }, repository = 'repeat98/modwerk'
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllGlobals() })
function fixture({ foreign = false, symlink = false, registryChange = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-author-policy-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path, data) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof data === 'object' ? JSON.stringify(data) + '\n' : data) }
  git('init', '-q'); git('config', 'user.name', 'Modwerk test'); git('config', 'user.email', 'modwerk-test@example.test')
  const doc = { id: 'playmodes', version: '0.1.0-experimental', author: { github: 'devilfish707' }, license: { spdx: 'MIT' }, compatibility: { effectId: null } }
  write('.github/module-authors.json', { schemaVersion: 1, accounts: { devilfish707: author.id } })
  write('sdk/catalog.json', { schemaVersion: 1, sourceRevision: 'd'.repeat(40), modules: [{ id: 'playmodes', version: doc.version }] })
  write('sdk/octabam/modules/playmodes/octamod.module.json', doc)
  write('sdk/octabam/modules/playmodes/source.c', 'original code\n')
  write('sdk/octabam/modules/playmodes/media/location.png', 'fixture only')
  git('add', '.'); git('commit', '-qm', 'trusted base'); const base = git('rev-parse', 'HEAD')
  write('sdk/octabam/modules/playmodes/octamod.module.json', { ...doc, version: '0.1.1-experimental' })
  write('sdk/octabam/modules/playmodes/source.c', 'fixed code\n')
  if (foreign) write('sdk/octabam/tools/build/build_bus.py', 'malicious compiler')
  if (registryChange) write('.github/module-authors.json', { schemaVersion: 1, accounts: { devilfish707: 1 } })
  git('add', '.')
  if (symlink) git('update-index', '--add', '--cacheinfo', '120000', git('hash-object', '-w', 'sdk/octabam/modules/playmodes/source.c'), 'sdk/octabam/modules/playmodes/link')
  git('commit', '-qm', 'author head'); const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}')
  const merge = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'bot merge')
  return { root, base, head, merge, git }
}
describe('trusted Git object inspection', () => {
  it('reads the exact base and head while the checkout stays unchanged', () => {
    const f = fixture(); f.git('checkout', '-q', f.base)
    const result = inspectAuthorUpdate(f.root, f.base, f.head, author)
    expect(result).toMatchObject({ modules: ['playmodes'], octatrack: true, elemodCompile: false })
    expect(f.git('rev-parse', 'HEAD')).toBe(f.base)
    expect(f.git('status', '--porcelain')).toBe('')
  })
  it('rejects a Digi runtime update that would keep serving its old native download', () => {
    const f = fixture()
    f.git('checkout', '-q', f.base)
    const folder = 'sdk/digitakt/modules/demo'
    mkdirSync(join(f.root, folder), { recursive: true })
    const doc = { id: 'demo', machine: 'digitakt', version: '1.0.0', author: { github: author.login }, license: { spdx: 'MIT' } }
    writeFileSync(join(f.root, folder, 'modwerk.module.json'), JSON.stringify(doc))
    writeFileSync(join(f.root, folder, 'source.c'), 'old code')
    f.git('add', '.'); f.git('commit', '-qm', 'owner-approved Digi addition'); const base = f.git('rev-parse', 'HEAD')
    writeFileSync(join(f.root, folder, 'modwerk.module.json'), JSON.stringify({ ...doc, version: '1.0.1' }))
    writeFileSync(join(f.root, folder, 'source.c'), 'fixed code')
    f.git('add', '.'); f.git('commit', '-qm', 'source-only fix'); const head = f.git('rev-parse', 'HEAD')
    expect(() => inspectAuthorUpdate(f.root, base, head, author)).toThrow('matching authored elekloader packages')
  })
  it.each([{ foreign: true }, { symlink: true }, { registryChange: true }])('rejects unsafe Git trees: %j', options => {
    const f = fixture(options)
    expect(() => inspectAuthorUpdate(f.root, f.base, f.head, author)).toThrow()
  })
  it('assembles the served elekloader catalog from the upstream catalog and module records at both commits', () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-author-records-')); roots.push(root)
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const write = (path, data) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(data) + '\n') }
    git('init', '-q'); git('config', 'user.name', 'Modwerk test'); git('config', 'user.email', 'modwerk-test@example.test')
    const doc = { id: 'demo', machine: 'digitakt', version: '1.0.0', author: { github: author.login }, license: { spdx: 'MIT' }, source: { repository: 'https://github.com/' + author.login + '/demo', revision: 'c'.repeat(40) } }
    const source = { repo: author.login + '/demo', commit: 'c'.repeat(40), path: 'demo.elemod' }
    const pin = { file: 'demo-1.0.0.elemod', sha256: '1'.repeat(64), id: 'demo', version: '1.0.0', device: 'digitakt-mk1', os: '1.54', license: 'MIT', author: author.login, title: 'Demo', requires: ['core'], conflicts: [], source }
    const other = { ...pin, file: 'other.elemod', id: 'other', title: 'Other', author: 'someone' }
    const record = mods => ({ schema: 1, kind: 'elekloader-catalog', revision: 'record', cores: [], mods })
    const artifact = { elemod: 2, id: 'demo', version: '1.0.0', license: 'MIT', author: author.login, target: { device: 'digitakt-mk1', os: '1.54' } }
    write('.github/module-authors.json', { schemaVersion: 1, accounts: { [author.login]: author.id } })
    write('sdk/catalog.json', { schemaVersion: 1, sourceRevision: 'd'.repeat(40), modules: [] })
    write('sdk/digitakt/modules/demo/modwerk.module.json', doc)
    write('vendor/elekloader/upstream-catalog.json', { schema: 1, kind: 'elekloader-catalog', revision: 'upstream', cores: [{ file: 'core.elemod', sha256: '0'.repeat(64), id: 'core', version: '2.1', device: 'digitakt-mk1', os: '1.54', license: 'GPL-3.0', source: { repo: 'irpina/elekloader', tag: 'v1' } }], mods: [] })
    write('vendor/elekloader/elekloader.lock.json', { schema: 1, kind: 'elekloader-kit-lock', kit: { files: {} }, catalog: {} })
    write('vendor/elekloader/catalog/demo-1.0.0.elemod', artifact)
    write('sdk/imports/elekloader-demo-2026-10-14.json', record([pin]))
    write('sdk/imports/elekloader-other-2026-10-14.json', record([other]))
    git('add', '.'); git('commit', '-qm', 'approved base'); const base = git('rev-parse', 'HEAD')
    const update = (extra = () => {}) => {
      git('checkout', '-q', '--detach', base)
      write('sdk/digitakt/modules/demo/modwerk.module.json', { ...doc, version: '1.0.1', source: { ...doc.source, revision: 'e'.repeat(40) } })
      write('vendor/elekloader/catalog/demo-1.0.1.elemod', { ...artifact, version: '1.0.1' })
      rmSync(join(root, 'vendor/elekloader/catalog/demo-1.0.0.elemod'))
      write('sdk/imports/elekloader-demo-2026-10-14.json', record([{ ...pin, file: 'demo-1.0.1.elemod', sha256: '2'.repeat(64), version: '1.0.1', source: { ...source, commit: 'e'.repeat(40) } }]))
      extra()
      git('add', '-A'); git('commit', '-qm', 'author update'); return git('rev-parse', 'HEAD')
    }
    expect(inspectAuthorUpdate(root, base, update(), author)).toMatchObject({ modules: ['digitakt-demo'], vendorPackages: true })
    expect(() => inspectAuthorUpdate(root, base, update(() => write('sdk/imports/elekloader-other-2026-10-14.json', record([{ ...other, sha256: '3'.repeat(64) }]))), author)).toThrow('Other elekloader modules')
    expect(() => inspectAuthorUpdate(root, base, update(() => write('sdk/imports/elekloader-demo-2026-10-14.json', { kind: 'not a catalog' })), author)).toThrow('valid elekloader catalog')
  })
})

function github(f, options = {}) {
  const body = '- [x] ' + AUTHOR_RELEASE_REQUEST + '\n- [x] ' + AUTHOR_RELEASE_EVIDENCE
  const merger = options.owner ? { id: ownerId, login: 'repeat98' } : { id: options.botId ?? ACTIONS_BOT_ID, login: 'github-actions[bot]' }
  const pr = { number: 9, state: 'closed', merged: true, merge_commit_sha: f.merge, merged_at: '2026-10-08T13:00:00Z', base: { ref: 'main', repo: { full_name: repository } }, head: { sha: options.head ?? f.head }, user: options.author ?? author, merged_by: merger, body: options.withdraw ? '' : body }
  vi.stubGlobal('fetch', vi.fn(async url => {
    const path = new URL(url).pathname.replace('/repos/' + repository, '')
    if (path === '/commits/' + f.merge + '/pulls') return Response.json([{ number: 9 }])
    if (path === '/pulls/9') return Response.json(pr)
    if (path === '/issues/9/events') return Response.json([{ event: 'merged', commit_id: f.merge, actor: merger }])
    if (path === '/actions/workflows/module-pr.yml') return Response.json({ id: 12 })
    if (path === '/actions/workflows/12/runs') return Response.json({ workflow_runs: [{ id: 77, workflow_id: 12, path: '.github/workflows/module-pr.yml', event: 'pull_request', repository: { full_name: repository }, head_sha: f.head, status: 'completed', conclusion: options.conclusion ?? 'success' }] })
    if (path === '/actions/runs/77/jobs') return Response.json({ jobs: ['scope / ' + (options.base ?? f.base) + ' / ' + f.head, 'module-contract', 'octatrack-source'].map(name => ({ name, status: 'completed', conclusion: 'success' })) })
    return new Response('{}', { status: 404 })
  }))
}
describe('independent author release verification', () => {
  it('reconstructs author authority from merge parents, original registry and fresh GitHub checks', async () => {
    const f = fixture(); github(f)
    const approval = await fetchReleaseApproval(repository, f.merge, ownerId, 'fixture', 1, 0, { root: f.root })
    expect(approval).toMatchObject({ authorization: 'module-author', sourceCommit: f.merge, authorId: author.id, checkedBase: f.base, checkedHead: f.head, checkRunId: 77, modules: ['playmodes'] })
  })
  it('preserves the existing owner-reviewed release path', async () => {
    const f = fixture(); github(f, { owner: true, withdraw: true })
    expect(await fetchReleaseApproval(repository, f.merge, ownerId, 'fixture', 1, 0, { root: f.root })).toMatchObject({ moduleApproverId: ownerId, mergedBy: 'repeat98' })
  })
  it.each([{ botId: 1 }, { withdraw: true }, { head: 'f'.repeat(40) }, { author: { ...author, id: 1 } }, { conclusion: 'failure' }, { base: 'f'.repeat(40) }])('keeps the previous release when GitHub evidence is invalid: %j', async options => {
    const f = fixture(); github(f, options)
    await expect(fetchReleaseApproval(repository, f.merge, ownerId, 'fixture', 1, 0, { root: f.root })).rejects.toThrow()
  })
  it('rejects another module/compiler change even when a bot merged it and CI is green', async () => {
    const f = fixture({ foreign: true }); github(f)
    await expect(fetchReleaseApproval(repository, f.merge, ownerId, 'fixture', 1, 0, { root: f.root })).rejects.toThrow('Owner review')
  })
})
