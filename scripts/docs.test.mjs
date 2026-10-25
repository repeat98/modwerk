import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LIMIT, checkDocs } from './docs.mjs'

const folders = []
function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'docs-')), git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  folders.push(root)
  write(root, files)
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'base')
  return root
}
function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}
afterEach(() => { for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true }) })
const text = bytes => 'x'.repeat(bytes)

describe('documents', () => {
  it('keeps the commands in AGENTS.md and both skill folders one to one', () => {
    const skill = (name, text = '---\nname: ' + name + '\n---\n') => ({ ['.claude/skills/' + name + '/SKILL.md']: text, ['.agents/skills/' + name + '/SKILL.md']: text })
    const root = repository({ 'AGENTS.md': '## Commands\n\nStart with `/modwerk-a <link>`.\n', ...skill('modwerk-a') })
    expect(checkDocs(root)).toEqual({ documents: 1 })
    write(root, skill('modwerk-b'))
    expect(() => checkDocs(root)).toThrow('.claude/skills/modwerk-b is not listed under Commands in AGENTS.md.')
    write(root, { 'AGENTS.md': '`/modwerk-a`, `/modwerk-b`, `/modwerk-c`\n', '.claude/skills/modwerk-b/SKILL.md': 'name: modwerk-b\nchanged\n' })
    expect(() => checkDocs(root)).toThrow(/agents\/skills\/modwerk-b\/SKILL.md must be a copy[^]*lists \/modwerk-c, but/)
  })
  it('lets a document grow to the limit, and one already over it shrink but not grow', () => {
    const root = repository({ 'docs/SHORT.md': text(100), 'docs/LONG.md': text(LIMIT + 500), 'AGENTS.md': text(100) })
    write(root, { 'docs/SHORT.md': text(LIMIT), 'docs/LONG.md': text(LIMIT + 400) })
    expect(checkDocs(root, 'HEAD')).toEqual({ documents: 3 })
    write(root, { 'docs/LONG.md': text(LIMIT + 501) })
    expect(() => checkDocs(root, 'HEAD')).toThrow('docs/LONG.md grew by 1 bytes to 32.5 KB')
    write(root, { 'docs/LONG.md': text(LIMIT), 'AGENTS.md': text(LIMIT + 1) })
    expect(() => checkDocs(root, 'HEAD')).toThrow('AGENTS.md grew by 32669 bytes to 32.0 KB, over the 32.0 KB')
  })
  it('refuses a new document over the limit, counting Windows line endings as Git does', () => {
    const root = repository({ 'docs/A.md': 'a\n'.repeat(LIMIT / 2) })
    write(root, { 'docs/A.md': 'a\r\n'.repeat(LIMIT / 2) })
    expect(checkDocs(root, 'HEAD')).toEqual({ documents: 1 })
    write(root, { 'docs/sub/NEW.md': text(LIMIT + 1) })
    expect(() => checkDocs(root, 'HEAD')).toThrow('docs/sub/NEW.md is new at 32.0 KB, over')
  })
  it('keeps the frozen logs as they are, apart from a note, and their size out of the limit', () => {
    const log = '# Verification record\n\n## Old — 1 October 2026\n\n- Old result.\n' + text(LIMIT)
    const root = repository({ 'docs/VERIFICATION.md': log, 'docs/DECISIONS.md': '# Decisions\n\n## Old\n\nText.\n' })
    write(root, { 'docs/VERIFICATION.md': log.replace('\n\n## Old', '\n\nFrozen; new records go in docs/verification/.\n\n## Old') })
    expect(checkDocs(root, 'HEAD')).toEqual({ documents: 0 })
    write(root, { 'docs/VERIFICATION.md': log.replace('- Old result.', '- Old result.\n- New result.') })
    expect(() => checkDocs(root, 'HEAD')).toThrow('docs/VERIFICATION.md: frozen on 25 October 2026. Put a new record in its own file, docs/verification/<YYYY-MM-DD>-<topic>.md.')
    write(root, { 'docs/VERIFICATION.md': log, 'docs/DECISIONS.md': '# Decisions\n\n## New\n\nText.\n\n## Old\n\nText.\n' })
    expect(() => checkDocs(root, 'HEAD')).toThrow('docs/decisions/<YYYY-MM-DD>-<topic>.md')
  })
  it('names each record by its date', () => {
    expect(checkDocs(repository({ 'docs/decisions/2026-10-25-docs-limit.md': 'Text.\n' }))).toEqual({ documents: 1 })
    expect(() => checkDocs(repository({ 'docs/verification/base-update.md': 'Text.\n' }))).toThrow('docs/verification/base-update.md: name each record')
    expect(() => checkDocs(repository({ 'docs/decisions/2026/notes.md': 'Text.\n' }))).toThrow('name each record')
  })
})
