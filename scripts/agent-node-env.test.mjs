import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { main, nodeBin } from './agent-node-env.mjs'

const folders = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('agent Node hook', () => {
  it('picks the newest installed Node of the wanted major, and nothing when the running one fits', () => {
    const installed = ['v18.20.8', 'v24.4.1', 'v24.22.2', 'v24.9.0', 'v25.1.0']
    expect(nodeBin({ wanted: 24, current: '18.20.8', installed, nvmDir: '/n' })).toBe(join('/n', 'versions', 'node', 'v24.22.2', 'bin'))
    expect(nodeBin({ wanted: 24, current: '24.1.0', installed, nvmDir: '/n' })).toBeNull()
    expect(nodeBin({ wanted: 24, current: '18.20.8', installed: ['v18.20.8'], nvmDir: '/n' })).toBeUndefined()
  })

  it('writes the PATH line to the session environment file when the running Node is older', () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-node-')); folders.push(root)
    writeFileSync(join(root, '.nvmrc'), '999\n')
    mkdirSync(join(root, 'nvm', 'versions', 'node', 'v999.0.1'), { recursive: true })
    const file = join(root, 'env.sh')
    writeFileSync(file, '')
    expect(main({ CLAUDE_PROJECT_DIR: root, NVM_DIR: join(root, 'nvm'), CLAUDE_ENV_FILE: file })).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(`export PATH="${join(root, 'nvm', 'versions', 'node', 'v999.0.1', 'bin')}:$PATH"\n`)
  })
})
