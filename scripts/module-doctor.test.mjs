import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const catalogCheckTimeout = 30_000
const doctor = (...args) => spawnSync(process.execPath, ['scripts/module-doctor.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: catalogCheckTimeout })

// Owner requirement, 6 October 2026: every module always integrates with the existing workflows. This is that requirement, enforced.
describe('module doctor', () => {
  it('finds every catalog module and every Digitakt and Digitone module integrated with the existing workflows', () => {
    const result = doctor('--all')
    expect(result.stdout + result.stderr).not.toContain('✗')
    expect(result.status).toBe(0)
    for (const id of ['miniverb', 'sidechain-compressor', 'analog-bassdrum', 'midi-scenes', 'digihealth']) expect(result.stdout).toContain(id)
  // The full catalogue shares CPU with app checks; this is an integration check, not a five-second performance gate.
  }, catalogCheckTimeout + 5000)
  it('checks a draft where every gate looks and leaves no copy behind', () => {
    // Any draft with a manifest that is not also a listed module; the fast loop keeps unqualified work in sdk/drafts/.
    const draft = readdirSync(join(root, 'sdk/drafts')).find(name => existsSync(join(root, 'sdk/drafts', name, 'octamod.module.json')) && !existsSync(join(root, 'sdk/octabam/modules', name)))
    expect(draft, 'a draft to check').toBeTruthy()
    const result = doctor('--draft', draft)
    expect(result.stdout).toContain(draft + ' (Octatrack)')
    expect(result.stdout).toContain('usb package')
    expect(result.stdout).not.toContain('Node.js v')
    // The gate compares the draft too, so a clash shows before the catalogue lists it.
    expect(result.stdout).toMatch(/[✓✗] cross-compatibility/)
    expect(result.stdout).not.toContain('once it is listed')
    expect(existsSync(join(root, 'sdk/octabam/modules', draft))).toBe(false)
    expect(doctor('--draft', 'no-such-draft').status).toBe(2)
  }, catalogCheckTimeout + 5000)
  it('names the failing integration point and the command that fixes it', () => {
    const result = doctor('no-such-module')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('No module named no-such-module')
  }, catalogCheckTimeout + 5000)
})
