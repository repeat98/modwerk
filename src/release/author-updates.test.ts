import { describe, expect, it } from 'vitest'
import { ACTIONS_BOT_ID, AUTHOR_RELEASE_REQUEST, AUTHOR_RELEASE_EVIDENCE, authorizeAuthorUpdate, authorRequestedRelease, parseAuthorRegistry, requireAuthorChecks, type AuthorChange, type AuthorModule } from './author-updates'

const registry = { schemaVersion: 1 as const, accounts: { devilfish707: 86663946, irpina: 264014615 } }
const author = { login: 'devilfish707', id: 86663946, type: 'User' }, base = 'b'.repeat(40), head = 'a'.repeat(40)
const document = { id: 'tapehead', version: '0.1.2-experimental', author: { github: 'devilfish707' }, license: { spdx: 'MIT' }, compatibility: { effectId: 31 } }
const modules: AuthorModule[] = [{ folder: 'sdk/octabam/modules/tapehead', document }, { folder: 'sdk/octabam/modules/quantizer', document: { ...document, id: 'quantizer', author: { github: 'irpina' } } }]
const path = modules[0].folder + '/octamod.module.json'
const change = (path: string, before: unknown, after: unknown, regular = true): AuthorChange => ({ path, before: before === null ? null : JSON.stringify(before), after: after === null ? null : JSON.stringify(after), regular })
const update = () => [change(path, document, { ...document, version: '0.1.3-experimental' }), change(modules[0].folder + '/tapehead.asm', 'old', 'new')]
const body = '- [x] ' + AUTHOR_RELEASE_REQUEST + '\n- [x] ' + AUTHOR_RELEASE_EVIDENCE
describe('module author release authority', () => {
  it('requires both explicit release authorization and evidence review', () => {
    expect(authorRequestedRelease(body)).toBe(true)
    for (const text of [body.replace('[x]', '[ ]'), body.split('\n')[0], '> ' + body, body.replace('no required acceptance check is failed or untested.', 'some tests are pending.')]) expect(authorRequestedRelease(text)).toBe(false)
  })
  it('uses immutable IDs from the trusted registry and supports case changes', () => {
    expect(authorizeAuthorUpdate(registry, { ...author, login: 'Devilfish707' }, modules, update()).modules).toEqual(['tapehead'])
    for (const account of [{ ...author, id: 1 }, { ...author, type: 'Bot' }, { ...author, login: 'other' }]) expect(() => authorizeAuthorUpdate(registry, account, modules, update())).toThrow('registered')
    expect(ACTIONS_BOT_ID).toBe(41898282)
    expect(() => parseAuthorRegistry({ ...registry, accounts: { devilfish707: '86663946' } })).toThrow('immutable')
  })
  it('rejects cross-author, new-module and ownership/waiver changes', () => {
    const bad = [
      [...update(), change(modules[1].folder + '/source.s', 'old', 'new')],
      [...update(), change('sdk/octabam/modules/new-module/source.s', null, 'new')],
      [change(path, document, { ...document, version: '0.1.3-experimental', author: { github: 'other' } })],
      [change(path, document, { ...document, version: '0.1.3-experimental', tests: { releaseWaiver: {} } })],
      [...update(), change('sdk/module-release-waivers.json', {}, {})],
      [...update(), change('.github/module-authors.json', registry, { ...registry, accounts: { other: author.id } })],
    ]
    for (const changes of bad) expect(() => authorizeAuthorUpdate(registry, author, modules, changes)).toThrow()
  })
  it('keeps module, upstream and media licence text changes on the owner review path', () => {
    for (const file of ['LICENSE', 'upstream/LICENSE.txt', 'media/LICENSE.md', 'COPYING', 'NOTICE']) expect(() => authorizeAuthorUpdate(registry, author, modules, [...update(), change(modules[0].folder + '/' + file, 'original terms', 'changed terms')])).toThrow('Licence text changes')
  })
  it('rejects unchanged versions, deletions, symlinks, firmware and hidden workflow paths', () => {
    for (const changes of [[change(path, document, document)], [change(path, document, null)], [...update(), change(modules[0].folder + '/source.s', null, 'link', false)], [...update(), change(modules[0].folder + '/firmware.bin', null, 'bytes')], [...update(), change(modules[0].folder + '/.github/x.yml', null, 'x')]]) expect(() => authorizeAuthorUpdate(registry, author, modules, changes)).toThrow()
  })
  it('allows two owned modules and scopes the same ID separately on each machine', () => {
    const owned = [modules[0], { folder: 'sdk/octabam/modules/playmodes', document: { ...document, id: 'playmodes' } }]
    const changes = [...update(), change(owned[1].folder + '/octamod.module.json', owned[1].document, { ...owned[1].document, version: '0.1.3-experimental' })]
    expect(authorizeAuthorUpdate(registry, author, owned, changes).modules).toEqual(['playmodes', 'tapehead'])
    const digi = ['digitakt', 'digitone'].map(machine => ({ folder: 'sdk/' + machine + '/modules/digihealth', document: { ...document, id: 'digihealth', machine } }))
    const edits = [change(digi[0].folder + '/modwerk.module.json', digi[0].document, { ...digi[0].document, version: '0.1.3-experimental' })]
    expect(authorizeAuthorUpdate(registry, author, digi, edits).modules).toEqual(['digitakt-digihealth'])
  })
  it('permits only owned catalog entries and preserves published notes', () => {
    const catalog = { schemaVersion: 2, revision: head, modules: modules.map(module => module.document) }
    const next = { ...catalog, modules: [{ ...document, version: '0.1.3-experimental' }, modules[1].document] }
    expect(authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/catalog/module-documents.json', catalog, next)]).modules).toEqual(['tapehead'])
    expect(() => authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/catalog/module-documents.json', catalog, { ...next, modules: [next.modules[0], { ...next.modules[1], version: '9.0.0' }] })])).toThrow('Catalog')
    const notes = { schemaVersion: 1, modules: { tapehead: [{ version: '0.1.2', changes: ['original'] }], quantizer: [] } }
    expect(() => authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/community/module-changelogs.json', notes, { ...notes, modules: { ...notes.modules, tapehead: [] } })])).toThrow('Preserve')
  })
  it('freezes other compiled modules and common runtime even when package reproduction passes', () => {
    const pkg = { schema: 1, sourceCommit: null, moduleVersions: { tapehead: document.version, quantizer: '1.0.0' }, packages: [{ id: 'tapehead', code: 'old' }, { id: 'quantizer', code: 'fixed' }] }
    const next = { ...pkg, sourceCommit: head, moduleVersions: { ...pkg.moduleVersions, tapehead: '0.1.3-experimental' }, packages: [{ id: 'tapehead', code: 'new' }, pkg.packages[1]] }
    expect(authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/engine/assets/dsp-packages.json', pkg, next)]).packages).toBe(true)
    expect(() => authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/engine/assets/dsp-packages.json', pkg, { ...next, packages: [next.packages[0], { id: 'quantizer', code: 'tampered' }] })])).toThrow('common runtime')
    expect(() => authorizeAuthorUpdate(registry, author, modules, [...update(), change('src/engine/assets/bootstrap-package.json', { code: 'old' }, { code: 'new' })])).toThrow('common runtime')
  })
})

const run = { repository: { full_name: 'repeat98/modwerk' }, workflow_id: 12, path: '.github/workflows/module-pr.yml', event: 'pull_request', head_sha: head, status: 'completed', conclusion: 'success' }
const jobs = ['scope / ' + base + ' / ' + head, 'module-contract', 'octatrack-source', 'elemod-source'].map(name => ({ name, status: 'completed', conclusion: 'success' }))
const scope = { octatrack: true, packages: false, elemodCompile: true }
describe('exact author release checks', () => {
  it('accepts matching successful jobs without relying on fork PR associations', () => expect(() => requireAuthorChecks(run, jobs, 'repeat98/modwerk', head, base, 12, scope)).not.toThrow())
  it('rejects old base/head, alternate workflows/repositories, incomplete or failed runs', () => {
    for (const mutation of [{ head_sha: base }, { repository: { full_name: 'attacker/fork' } }, { workflow_id: 13 }, { path: '.github/workflows/other.yml' }, { event: 'push' }, { conclusion: 'failure' }, { status: 'in_progress' }]) expect(() => requireAuthorChecks({ ...run, ...mutation }, jobs, 'repeat98/modwerk', head, base, 12, scope)).toThrow()
    expect(() => requireAuthorChecks(run, jobs, 'repeat98/modwerk', head, 'c'.repeat(40), 12, scope)).toThrow('scope')
  })
  it('requires each compilation job once and successful, never skipped', () => {
    for (const name of ['module-contract', 'octatrack-source', 'elemod-source']) for (const conclusion of ['skipped', 'cancelled', 'failure']) expect(() => requireAuthorChecks(run, jobs.map(job => job.name === name ? { ...job, conclusion } : job), 'repeat98/modwerk', head, base, 12, scope)).toThrow(name)
    expect(() => requireAuthorChecks(run, [...jobs, jobs[1]], 'repeat98/modwerk', head, base, 12, scope)).toThrow('module-contract')
    expect(() => requireAuthorChecks(run, jobs.filter(job => job.name !== 'elemod-source'), 'repeat98/modwerk', head, base, 12, { ...scope, elemodCompile: false })).not.toThrow()
  })
})
