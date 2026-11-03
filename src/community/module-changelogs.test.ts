import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import data from './module-changelogs.json'
import { COMMUNITY_MODULES } from './modules'
import { ModuleChangelog } from './ModuleChangelog'
import { mergeModuleReleases, moduleChangelogs, parseModuleChangelogs } from './module-changelogs'

const entry = { version: '1.0.0-experimental', date: '2026-10-07', changes: ['Correct the clock reset during playback.'] }
const fixture = (entries = [entry]) => ({ schemaVersion: 1, modules: { euclid: entries } })

describe('module release notes', () => {
  it('preserves an explicit announcement choice without enabling it by default', () => {
    expect(parseModuleChangelogs(fixture()).euclid[0].announce).toBeUndefined()
    for (const announce of [true, false]) {
      const notes = parseModuleChangelogs({ schemaVersion: 1, modules: { euclid: [{ ...entry, announce }] } })
      expect(notes.euclid[0].announce).toBe(announce)
    }
    expect(() => parseModuleChangelogs({ schemaVersion: 1, modules: { euclid: [{ ...entry, announce: 'true' }] } })).toThrow('Invalid announcement opt-in')
  })

  it('covers every current catalog release across every instrument', () => {
    const notes = parseModuleChangelogs(data, COMMUNITY_MODULES)
    expect(Object.keys(notes).length).toBe(COMMUNITY_MODULES.length)
    expect(new Set(COMMUNITY_MODULES.map(module => module.machine))).toEqual(new Set(['octatrack', 'digitakt', 'digitone', 'analog-rytm-mkii']))
  })

  it('rejects an updated catalog version without matching written notes', () => {
    expect(() => parseModuleChangelogs(fixture(), [{ id: 'euclid', version: '1.0.1-experimental' }])).toThrow('Missing release notes for euclid v1.0.1-experimental')
    expect(() => parseModuleChangelogs(fixture(), [{ id: 'euclid', version: '0.9.0-experimental' }])).toThrow('Missing release notes')
    expect(() => parseModuleChangelogs(fixture(), [{ id: 'other', version: entry.version }])).toThrow('Unknown changelog module')
  })

  it('keeps every release short enough for players to read', () => {
    const catalog = [{ id: 'euclid', version: entry.version }]
    expect(() => parseModuleChangelogs(fixture([{ ...entry, changes: Array(5).fill(entry.changes[0]) }]), catalog)).not.toThrow()
    expect(() => parseModuleChangelogs(fixture([{ ...entry, changes: Array(6).fill(entry.changes[0]) }]), catalog)).toThrow('Keep the release notes for euclid v1.0.0-experimental short')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, changes: ['x'.repeat(201)] }]), catalog)).toThrow('at most 200 characters')
  })

  it('rejects duplicate versions, impossible dates, empty summaries and invalid references', () => {
    expect(() => parseModuleChangelogs(fixture([entry, entry]))).toThrow('Duplicate changelog version')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, date: '2026-02-30' }]))).toThrow('Invalid changelog date')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, changes: [] }]))).toThrow('Describe the changes')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, changes: ['Updated'] }]))).toThrow('Describe the changes')
    expect(() => parseModuleChangelogs({ schemaVersion: 1, modules: { euclid: [{ ...entry, sourceCommit: '../invalid' }] } })).toThrow('Invalid source commit')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, version: 'not-a-version' }]))).toThrow('Invalid module semantic version')
    expect(() => parseModuleChangelogs(fixture([{ ...entry, version: '1.0.0-experimental.01' }]))).toThrow('leading zeros')
  })

  it('merges and deduplicates live history without losing offline notes or inventing missing notes', () => {
    const notes = [entry, { ...entry, version: '1.0.0-experimental.2' }]
    const releases = mergeModuleReleases(notes, [
      { version: '1.0.0-experimental.10', recordedAt: '2026-10-09' },
      { version: entry.version, recordedAt: '2026-10-07' },
    ])
    expect(releases.map(release => release.version)).toEqual(['1.0.0-experimental.10', '1.0.0-experimental.2', '1.0.0-experimental'])
    expect(releases[0].notes).toBeUndefined()
    expect(releases[0].previousVersion).toBe(notes[1].version)
    expect(releases[2]).toMatchObject({ recordedAt: '2026-10-07', notes: entry, previousVersion: null })
    expect(mergeModuleReleases(notes)).toHaveLength(2)
  })

  it.each(['euclid', 'digitakt-digieq', 'digitone-digitables'])('renders authored changes for %s before the history service responds', id => {
    const html = renderToStaticMarkup(createElement(ModuleChangelog, { id }))
    expect(html).toContain('module-release-notes')
    expect(html).toContain('Current version')
    expect(html).toContain('View changes')
    const sourceCommit = moduleChangelogs[id][0].sourceCommit
    if (sourceCommit) expect(html).toContain(sourceCommit)
    expect(html).toContain(moduleChangelogs[id][0].changes[0])
    expect(html).not.toContain('Loading changelog')
    expect(html).not.toContain('No release history')
  })
})
