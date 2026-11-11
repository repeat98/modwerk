import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lockDirectory } from './directory-lock.mjs'

describe('directory lock', () => {
  it('makes a second taker wait until the first releases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'))
    const release = await lockDirectory(dir)
    const waited = []
    let second = false
    const next = lockDirectory(dir, { poll: 10, waiting: pid => waited.push(pid) }).then(done => { second = true; return done })
    await new Promise(done => setTimeout(done, 50))
    expect(second).toBe(false)
    expect(waited).toEqual([process.pid])
    release()
    ;(await next)()
    expect(second).toBe(true)
  })
  it('takes over a lock whose process is gone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'))
    const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout
    mkdirSync(join(dir, '.lock')); writeFileSync(join(dir, '.lock', 'pid'), gone)
    const waited = []
    ;(await lockDirectory(dir, { poll: 10, waiting: pid => waited.push(pid) }))()
    expect(waited).toEqual([])
  })
})
