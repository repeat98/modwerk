import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PACKAGES, formatRetestQueue, packageHistory, retestQueue } from './retest-queue.mjs'

const sha = digit => digit.repeat(64)
const bases = [{ version: '0.7', identities: [sha('b')] }]
const module = (id, hardware, hardwareStatus = 'reported') => ({ id, version: '0.1.0-experimental', tests: { hardwareStatus, qualification: hardware && { imageSha256: hardware.imageSha256, hardware: { kind: 'functional', status: 'reported', model: 'MKII', testedOn: '2026-11-01', summary: '', ...hardware } } } })
const row = (id, digest, extra = {}) => ({ id, version: '0.1.0-experimental', sha256: sha(digest), abi: 8, ...extra })
const published = (digest, since, extra = {}) => ({ sha256: sha(digest), version: '0.1.0-experimental', abi: 8, requiredBase: null, since, commit: 'c', ...extra })
const queue = (document, shipped, history = {}) => retestQueue({ documents: [document], packages: [shipped], history, bases })

describe('retest queue', () => {
  it('lists nothing for a record that ran the shipped package, and only compares reported records with a package', () => {
    expect(queue(module('a', { imageSha256: sha('1') }), row('a', '1')).due).toEqual([])
    expect(queue(module('a', { imageSha256: sha('1') }, 'untested'), row('a', '2')).due).toEqual([])
    expect(retestQueue({ documents: [module('a', { imageSha256: sha('1') })], packages: [], bases }).due).toEqual([])
    expect(queue(module('a', null), row('a', '1')).unrecorded).toEqual(['a'])
  })

  it('says the package changed when the record ran an earlier package with the same abi and base pin', () => {
    const [due] = queue(module('a', { imageSha256: sha('1') }), row('a', '2'), { a: [published('1', '2026-10-01'), published('2', '2026-11-02')] }).due
    expect(due).toMatchObject({ reason: 'package changed', ran: { build: 'usb', sha256: '11111111' }, ships: { sha256: '22222222', since: '2026-11-02', base: null } })
    expect(due.detail).toBe('package 11111111 → 22222222, same abi 8 and base pin')
  })

  it('says the base changed when the package was rebuilt for another base or abi, and names a versioned base', () => {
    const shipped = row('a', '2', { requiredBase: sha('b') })
    const [pinned] = queue(module('a', { imageSha256: sha('9'), summary: 'the 0.1.0 package (11111111...) on base cccccccc' }), shipped, { a: [published('1', '2026-10-01', { requiredBase: sha('c') }), published('2', '2026-11-16', { requiredBase: sha('b') })] }).due
    expect(pinned).toMatchObject({ reason: 'base changed', recordBase: 'cccccccc (no version)', ships: { base: '0.7' } })
    expect(pinned.detail).toBe('package 11111111 → 22222222: rebuilt for base cccccccc (no version) → 0.7')
    const [abi] = queue(module('a', { imageSha256: sha('1') }), row('a', '2', { abi: 9 }), { a: [published('1', '2026-10-01'), published('2', '2026-11-02')] }).due
    expect(abi.detail).toContain('abi 8 → 9')
  })

  it('says the base changed when the record ran the shipped package and names the base image it booted', () => {
    const [due] = queue(module('a', { imageSha256: sha('9'), summary: 'MAIN.raw 99999999; the USB package 22222222 ran on FX2' }), row('a', '2'), { a: [published('2', '2026-10-01')] }).due
    expect(due).toMatchObject({ reason: 'base changed', image: '99999999', ran: { sha256: '22222222' } })
    expect(due.detail).toContain('record names base image 99999999')
  })

  it('reads a card build from the summary or from a record older than every package, and an unpublished USB build otherwise', () => {
    const history = { a: [published('2', '2026-11-02')] }
    for (const summary of ['flashed the native card image (MAIN OS 99999999, OS VERSION X)', 'the card build of this source', 'MAIN OS 99999999'])
      expect(queue(module('a', { imageSha256: sha('9'), summary }), row('a', '2'), history).due[0]).toMatchObject({ reason: 'card build', ran: { build: 'card' } })
    expect(queue(module('a', { imageSha256: sha('9'), summary: 'flashed it and played', testedOn: '2026-10-01' }), row('a', '2'), history).due[0].reason).toBe('card build')
    // A package tried a day before the first one was published is still a USB build; a card that holds a set is not a card build.
    const unpublished = queue(module('a', { imageSha256: sha('9'), summary: 'Package 99999999 (608 bytes): card set 1/1', testedOn: '2026-11-01' }), row('a', '2'), history).due[0]
    expect(unpublished).toMatchObject({ reason: 'package changed', ran: { build: 'usb' } })
    expect(unpublished.detail).toBe('ran USB build 99999999, never published; ships 22222222')
  })

  it('notes a USB package kept at an earlier version by a declared lag', () => {
    const [due] = queue(module('a', { imageSha256: sha('9'), summary: 'MAIN OS 99999999' }), row('a', '2', { version: '0.0.9-experimental' }))
      .due
    expect(due.detail).toContain('kept at 0.0.9-experimental by a declared lag')
  })

  it('prints one row per module with what changed, and says when there is no history to read', () => {
    const result = retestQueue({ documents: [module('b', { imageSha256: sha('9'), summary: 'MAIN OS 99999999' }), module('a', { imageSha256: sha('1') }), module('c', null)], packages: [row('a', '2'), row('b', '3'), row('c', '4')], history: { a: [published('1', '2026-10-01'), published('2', '2026-11-02')] }, bases })
    expect(result.due.map(item => item.id)).toEqual(['a', 'b'])
    const text = formatRetestQueue(result)
    expect(text).toMatch(/module\s+tested on\s+record ran\s+ships\s+record base\s+ships for base\s+reason/)
    expect(text).toMatch(/a\s+2026-11-01\s+USB 11111111\s+22222222 since 2026-11-02\s+not recorded\s+any\s+package changed/)
    expect(text).toMatch(/b\s+2026-11-01\s+card 99999999\s+33333333\s+not recorded\s+any\s+card build/)
    expect(text).toContain('not compared: c')
    expect(formatRetestQueue(result, { history: false })).toContain('No Git history')
    expect(formatRetestQueue({ due: [], unrecorded: [] })).toContain('none: every module')
  })

  it('reads each digest once from the package file\'s history, at the commit that first shipped it', () => {
    const root = mkdtempSync(join(tmpdir(), 'retest-queue-'))
    try {
      const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: root, stdio: 'pipe' })
      git('init', '-q')
      mkdirSync(join(root, dirname(PACKAGES)), { recursive: true })
      for (const rows of [[row('a', '1')], [row('a', '1'), row('b', '5', { requiredBase: sha('b') })], [row('a', '2'), row('b', '5', { requiredBase: sha('b') })]]) {
        writeFileSync(join(root, PACKAGES), JSON.stringify({ packages: rows }))
        git('add', '.'); git('commit', '-q', '-m', 'packages')
      }
      writeFileSync(join(root, PACKAGES), 'not json')
      git('add', '.'); git('commit', '-q', '-m', 'broken')
      const history = packageHistory(root)
      expect(history.a.map(item => item.sha256)).toEqual([sha('1'), sha('2')])
      expect(history.b).toEqual([expect.objectContaining({ sha256: sha('5'), requiredBase: sha('b'), abi: 8 })])
      expect(history.a[0].since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(packageHistory(tmpdir())).toEqual({})
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
