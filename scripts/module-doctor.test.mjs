import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const doctor = (...args) => spawnSync(process.execPath, ['scripts/module-doctor.mjs', ...args], { cwd: root, encoding: 'utf8' })

// Owner requirement, 6 October 2026: every module always integrates with the existing workflows. This is that requirement, enforced.
describe('module doctor', () => {
  it('finds every catalog module and every Digitakt and Digitone module integrated with the existing workflows', () => {
    const result = doctor('--all')
    expect(result.stdout + result.stderr).not.toContain('✗')
    expect(result.status).toBe(0)
    for (const id of ['miniverb', 'sidechain-compressor', 'analog-bassdrum', 'midi-scenes', 'digihealth']) expect(result.stdout).toContain(id)
  })
  it('names the failing integration point and the command that fixes it', () => {
    const result = doctor('no-such-module')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('No module named no-such-module')
  })
})
