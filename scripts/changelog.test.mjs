import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkChangelog, renderChangelog } from './changelog.mjs'

const folders = []
function repository(entries, history = '# Application changelog\n\nIntro.\n\n## 22 October 2026\n\n- Old entry.\n') {
  const root = mkdtempSync(join(tmpdir(), 'changelog-')), git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  folders.push(root)
  mkdirSync(join(root, 'changelog'))
  writeFileSync(join(root, 'CHANGELOG.md'), history)
  for (const [name, text] of Object.entries(entries)) writeFileSync(join(root, 'changelog', name), text)
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'base')
  return root
}
afterEach(() => { for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('application changelog entries', () => {
  it('renders one file per entry under its day, newest day first, above the frozen history', () => {
    const root = repository({ '2026-10-23-b.md': 'Second.\n', '2026-10-23-a.md': '- First.\n', '2026-10-24-c.md': 'Later.\n' })
    expect(renderChangelog(root)).toBe('# Application changelog\n\n## 24 October 2026\n\n- Later.\n\n## 23 October 2026\n\n- First.\n\n- Second.\n\n## 22 October 2026\n\n- Old entry.\n')
  })
  it('refuses badly named, empty or headed entries', () => {
    expect(() => checkChangelog(repository({ 'fix.md': 'x' }))).toThrow('<YYYY-MM-DD>-<topic>.md')
    expect(() => checkChangelog(repository({ '2026-02-30-x.md': 'x' }))).toThrow('is not a date')
    expect(() => checkChangelog(repository({ '2026-10-23-x.md': '\n' }))).toThrow('empty')
    expect(() => checkChangelog(repository({ '2026-10-23-x.md': '## 23 October\n- x' }))).toThrow('headings')
  })
  it('refuses a new entry or day in CHANGELOG.md, but not a note above the history', () => {
    const root = repository({})
    writeFileSync(join(root, 'CHANGELOG.md'), '# Application changelog\n\nIntro.\n\n## 23 October 2026\n\n- New.\n\n## 22 October 2026\n\n- Old entry.\n')
    expect(() => checkChangelog(root, 'HEAD')).toThrow('changelog/<YYYY-MM-DD>-<topic>.md')
    writeFileSync(join(root, 'CHANGELOG.md'), '# Application changelog\n\nIntro, with a pointer to changelog/.\n\n## 22 October 2026\n\n- Old entry.\n')
    expect(checkChangelog(root, 'HEAD')).toEqual({ entries: 0 })
  })
})
