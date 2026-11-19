import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { takeLease } from './frontend-mcp.mjs'

const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })
async function workspace() { const folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-lock-')); folders.push(folder); return folder }
async function lockedBy(folder, owner) {
  const lease = join(folder, '.mcp-lock')
  await mkdir(lease, { mode: 0o700 })
  if (owner) await writeFile(join(lease, 'owner.json'), JSON.stringify(owner), { mode: 0o600 })
  return lease
}

describe('the MCP workspace lock', () => {
  it('takes over a lock whose process has ended, as a health check or a crash leaves it', async () => {
    const lease = await lockedBy(await workspace(), { pid: 4242, started: '2026-11-18T16:34:00.000Z' })
    await takeLease(lease, { alive: () => false })
    expect(await readdir(lease)).toEqual([])
  })

  it('refuses a running owner\'s lock and names its PID', async () => {
    const lease = await lockedBy(await workspace(), { pid: 4242 })
    await expect(takeLease(lease, { alive: pid => pid === 4242 })).rejects.toThrow('in use by a running MCP server (PID 4242)')
    expect(await readdir(lease)).toEqual(['owner.json'])
  })

  it('waits for a lock still without an owner while it is fresh, and takes it over once old', async () => {
    const lease = await lockedBy(await workspace())
    await expect(takeLease(lease, { alive: () => false })).rejects.toThrow('starting')
    await takeLease(lease, { alive: () => false, now: () => Date.now() + 60_000 })
    expect(await readdir(lease)).toEqual([])
  })

  it('removes its lock when the server is stopped with SIGTERM', async () => {
    const folder = await workspace(), script = fileURLToPath(new URL('./frontend-mcp.mjs', import.meta.url))
    const child = spawn(process.execPath, [script, '--data-dir', folder], { stdio: ['pipe', 'pipe', 'pipe'] })
    // Wait until it answers, so it holds the lock and has its signal handlers.
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (String(chunk).includes('"id":1')) resolve() })
      child.on('exit', code => reject(new Error('The server exited early with ' + code)))
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
    })
    expect(await readdir(folder)).toContain('.mcp-lock')
    const exited = new Promise(resolve => child.on('exit', resolve))
    child.kill('SIGTERM')
    await exited
    expect(await readdir(folder)).not.toContain('.mcp-lock')
  }, 60000)
})
