import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nodeVersionProblem } from './require-node.mjs'

describe('the Node version check before npm ci and prepare', () => {
  it('passes Node 24 and later and names the fix for anything older', () => {
    expect(nodeVersionProblem('v24.21.0', 24)).toBeNull()
    expect(nodeVersionProblem('v25.0.0', 24)).toBeNull()
    expect(nodeVersionProblem('v20.19.6', 24)).toBe('Modwerk needs Node 24 (.nvmrc), but this shell runs Node 20.19.6.\n  With nvm: nvm install 24 && nvm use 24, then run this again.\n  So every new shell starts with it: nvm alias default 24.')
  })

  it('runs before anything else in preinstall and prepare', () => {
    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts
    expect(scripts.preinstall).toBe('node scripts/require-node.mjs')
    expect(scripts.prepare.startsWith('node scripts/require-node.mjs && ')).toBe(true)
  })
})
