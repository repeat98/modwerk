import { describe, expect, it } from 'vitest'
import { authorizeAuthorUpdate, type AuthorChange } from './author-updates'
const registry = { schemaVersion: 1 as const, accounts: { irpina: 264014615 } }, author = { login: 'irpina', id: 264014615, type: 'User' }
const folder = 'sdk/digitakt/modules/digihealth', document = { id: 'digihealth', machine: 'digitakt', version: '1.1.0-experimental', author: { github: 'irpina' }, maintainers: ['irpina'], license: { spdx: 'MIT' }, source: { repository: 'https://github.com/irpina/digihealth', revision: 'c'.repeat(40) } }, next = { ...document, version: '1.1.1-experimental' }
const modules = [{ folder, document }]
const pin = { id: 'digihealth', device: 'digitakt-mk1', os: '1.54', version: document.version, file: 'digihealth.elemod', sha256: 'old', license: 'MIT', author: 'irpina', requires: ['core'], source: { repo: 'irpina/digihealth', commit: document.source.revision, path: 'digihealth.elemod' } }
const other = { ...pin, id: 'digislicer', file: 'digislicer.elemod' }, updated = { ...pin, version: next.version, sha256: 'new' }
// The served catalog: the upstream catalog plus every module record, as trusted code assembles it at the base and head.
const catalog = { schema: 1, kind: 'elekloader-catalog', revision: 'a'.repeat(40), cores: [{ id: 'core', file: 'core.elemod' }], mods: [pin, other] }
const served = (mods: unknown[]) => ({ ...catalog, revision: 'b'.repeat(40), mods })
const lock = { schema: 1, kind: 'elekloader-kit-lock', kit: { files: { 'index.ts': 'fixed' } }, catalog: { revision: 'upstream', sha256: 'upstream', cores: 1, mods: 1 } }
const artifact = { elemod: 2, id: 'digihealth', version: pin.version, license: 'MIT', author: 'irpina', target: { device: pin.device, os: pin.os, section3_sha256: 'stock' }, sections: { '.run': { parts: [['hex', 'old']] } } }
const vendor = { catalog, next: served([updated, other]), lock, artifacts: { 'digihealth.elemod': artifact } }
const record = 'sdk/imports/elekloader-digihealth-2026-10-14.json', recordOf = (mods: unknown[]) => ({ schema: 1, kind: 'elekloader-catalog', revision: 'digihealth', cores: [], mods })
const change = (path: string, before: unknown, after: unknown): AuthorChange => ({ path, before: before === null ? null : JSON.stringify(before), after: after === null ? null : JSON.stringify(after), regular: true })
function edits() {
  return [change(folder + '/modwerk.module.json', document, next), change(folder + '/source.c', 'old', 'new'),
    change(record, recordOf([pin]), recordOf([updated])),
    change('vendor/elekloader/catalog/digihealth.elemod', artifact, { ...artifact, version: next.version, sections: { '.run': { parts: [['hex', 'new']] } } })]
}
describe('authored Digi packages', () => {
  it('permits the author package and its own record, with the kit, upstream catalog and other modules frozen', () => expect(authorizeAuthorUpdate(registry, author, modules, edits(), vendor)).toMatchObject({ vendorPackages: true, modules: ['digitakt-digihealth'] }))
  it('rejects relabelling a version without shipping its package', () => expect(() => authorizeAuthorUpdate(registry, author, modules, edits().slice(0, -1), vendor)).toThrow('updated elekloader package'))
  it('requires every approved OS variant rather than updating one while serving another old version', () => {
    const variant = { ...pin, os: '1.53', file: 'digihealth-153.elemod' }
    expect(() => authorizeAuthorUpdate(registry, author, modules, edits(), { ...vendor, catalog: { ...catalog, mods: [pin, variant, other] }, next: served([updated, variant, other]) })).toThrow('every approved OS package')
  })
  it('does not let a package for one module cover another touched module', () => {
    const second = { folder: 'sdk/digitakt/modules/another', document: { ...document, id: 'another' } }
    const changed = [...edits(), change(second.folder + '/modwerk.module.json', second.document, { ...second.document, version: next.version })]
    expect(() => authorizeAuthorUpdate(registry, author, [...modules, second], changed, vendor)).toThrow('Every released Digi module')
  })
  it('rejects floating or mismatched package source pins', () => {
    for (const source of [{ repo: pin.source.repo, tag: 'v1.1' }, { ...pin.source, commit: 'd'.repeat(40) }, { ...pin.source, repo: 'attacker/fork' }]) {
      expect(() => authorizeAuthorUpdate(registry, author, modules, edits(), { ...vendor, next: served([{ ...updated, source }, other]) })).toThrow('exact updated module source commit')
    }
  })
  it('rejects a changed core, other module, stock target or package owner', () => {
    expect(() => authorizeAuthorUpdate(registry, author, modules, edits(), { ...vendor, next: served([updated, { ...other, sha256: 'tampered' }]) })).toThrow('Other elekloader modules')
    expect(() => authorizeAuthorUpdate(registry, author, modules, edits(), { ...vendor, next: { ...served([updated, other]), cores: [{ id: 'core', file: 'tampered.elemod' }] } })).toThrow('Other elekloader modules')
    for (const after of [{ ...artifact, version: next.version, target: { ...artifact.target, os: 'unknown' } }, { ...artifact, version: next.version, author: 'attacker' }]) {
      expect(() => authorizeAuthorUpdate(registry, author, modules, edits().map(edit => edit.path.endsWith('.elemod') ? change(edit.path, artifact, after) : edit), vendor)).toThrow('stock target')
    }
  })
  it('leaves the lock, the upstream catalog and other modules’ records to the owner', () => {
    for (const extra of [change('vendor/elekloader/elekloader.lock.json', lock, { ...lock, kit: { files: { 'index.ts': 'tampered' } } }),
      change('vendor/elekloader/upstream-catalog.json', catalog, { ...catalog, about: 'changed' })]) {
      expect(() => authorizeAuthorUpdate(registry, author, modules, [...edits(), extra], vendor)).toThrow('outside the author packages')
    }
    expect(() => authorizeAuthorUpdate(registry, author, modules, [...edits(), change('sdk/imports/elekloader-digislicer-2026-10-14.json', recordOf([other]), recordOf([{ ...other, sha256: 'x' }]))], vendor)).toThrow('records of other modules')
    expect(() => authorizeAuthorUpdate(registry, author, modules, edits().map(edit => edit.path === record ? change(record, recordOf([pin]), { ...recordOf([updated]), cores: [{ id: 'core', device: 'digitakt-mk1', file: 'core.elemod' }] }) : edit), vendor)).toThrow('or cores')
  })
})
