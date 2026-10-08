import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkModuleChangelogs } from './module-changelogs.mjs'

const temporary = []
const note = version => ({ version, date: '2026-10-08', changes: ['Describe the actual controls and remaining limitations.'] })
function fixture({ draftNotes = true, unknown = false, sourceVersion = '1.0.0', draftVersion = '0.1.0-experimental', futureNotes = false, misplaced = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-changelog-'))
  temporary.push(root)
  const files = {
    'src/catalog/module-documents.json': { modules: [{ id: 'public', version: '1.0.0' }] },
    'src/catalog/machine-modules.json': { modules: [] },
    'sdk/catalog.json': { modules: [{ id: 'public', version: sourceVersion }, { id: 'draft', version: '0.1.0-experimental' }] },
    'src/community/module-changelogs.json': { schemaVersion: 1, modules: {
      public: [note('1.0.0'), ...(futureNotes ? [note(sourceVersion)] : [])],
      ...(draftNotes && !misplaced ? { draft: [note(draftVersion)] } : {}),
      ...(unknown ? { unrelated: [note('1.0.0')] } : {}),
    }, ...(misplaced ? { draft: [note(draftVersion)] } : {}) },
  }
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), JSON.stringify(value))
  }
  return root
}
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('source and public release-note validation', () => {
  it('requires notes for a new SDK entry before it enters the public catalog', () => {
    expect(checkModuleChangelogs(fixture())).toEqual({ modules: 2, releases: 2 })
    expect(() => checkModuleChangelogs(fixture({ draftNotes: false }))).toThrow('Missing release notes for draft')
    expect(() => checkModuleChangelogs(fixture({ draftVersion: '0.2.0-experimental' }))).toThrow('Missing release notes for draft')
    expect(() => checkModuleChangelogs(fixture({ misplaced: true }))).toThrow('Missing release notes for draft')
  })
  it('continues rejecting notes for an ID absent from both inventories', () => {
    expect(() => checkModuleChangelogs(fixture({ unknown: true }))).toThrow('Unknown changelog module: unrelated')
  })
  it('does not let source versions override existing public release versions', () => {
    expect(checkModuleChangelogs(fixture({ sourceVersion: '2.0.0' }))).toEqual({ modules: 2, releases: 2 })
    expect(() => checkModuleChangelogs(fixture({ sourceVersion: '2.0.0', futureNotes: true }))).toThrow('Changelog version is newer than the catalog for public')
  })
})
