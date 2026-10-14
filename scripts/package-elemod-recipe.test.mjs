import { test } from 'vitest'
import assert from 'node:assert/strict'
import { exportText, packageRecipe, reproducesExport } from './package-elemod-recipe.mjs'
import { readFile } from 'node:fs/promises'

const original = JSON.parse(await readFile(new URL('../sdk/imports/packages/digimono/digimono-0.13.2-experimental-os1.53.elemod', import.meta.url), 'utf8'))
const plan = { schemaVersion: 1, machine: 'digitakt', id: original.id, version: original.version, release: original.target.os, module: { ...original, sites: [] }, sites: [], derive: null }

test('refuses recipes that depend on local stock data', () => {
  for (const extra of [{ derive: {} }, { stockResumes: [{}] }, { stockRoutineBindings: {} }]) assert.throws(() => packageRecipe({ ...plan, ...extra }), /source-only/)
  assert.throws(() => packageRecipe({ ...plan, sites: [{ op: 'keep2' }] }), /remain local/)
})

test('explicit calls and pointer replacements retain hash guards and relocation offsets', () => {
  const sites = [
    { addr: '0x40030daa', len: 6, stockSha256: original.sites[1].stock_sha256, op: 'jsr', target: 'digimono_sname' },
    { addr: '0x401848dc', len: 4, stockSha256: '0'.repeat(64), op: 'ptr', target: 'digimono_sname' },
  ]
  const module = packageRecipe({ ...plan, sites })
  assert.equal(module.sites[0].new, '4eb900000000')
  assert.deepEqual(module.sites[0].relocs, [[2, 'abs32', 'sym:digimono_sname', 0]])
  assert.equal(module.sites[0].stock_sha256, sites[0].stockSha256)
  assert.deepEqual(module.sites[1].relocs, [[0, 'abs32', 'sym:digimono_sname', 0]])
  assert.throws(() => packageRecipe({ ...plan, sites: [{ ...sites[0], len: 4 }] }), /length/)
  assert.throws(() => packageRecipe({ ...plan, sites: [{ ...sites[0], stockSha256: 'bad' }] }))
})

test('refuses a module from another version or OS', () => {
  assert.throws(() => packageRecipe({ ...plan, version: '0.14.0-experimental' }), /identity/)
  assert.throws(() => packageRecipe({ ...plan, release: '1.54' }), /identity/)
})

test('exports explicit authored bytes and LEA with guards, and refuses partial instructions', () => {
  const guard = { addr: '0x40030daa', len: 6, stockSha256: 'a'.repeat(64) }
  const lea = { ...guard, op: 'lea', register: 5, target: 'digimono_sname' }
  const bytes = { ...guard, op: 'bytes', new: '72084e714e71', kind: 'code' }
  assert.equal(packageRecipe({ ...plan, sites: [lea] }).sites[0].new, '4bf900000000')
  assert.equal(packageRecipe({ ...plan, sites: [bytes] }).sites[0].new, bytes.new)
  for (const site of [{ ...bytes, target: 'bad' }, { ...bytes, new: '4e714e714ef9' }, { ...lea, register: 8 }]) assert.throws(() => packageRecipe({ ...plan, sites: [site] }))
})

test('an export published without resources.core still reproduces, and nothing else may differ', () => {
  const withCore = { ...plan, module: { ...plan.module, resources: { ...plan.module.resources, core: '2.1' } } }
  const old = exportText(packageRecipe(plan)), current = exportText(packageRecipe(withCore))
  assert.notEqual(old, current)
  assert.equal(reproducesExport(current, withCore), true)
  assert.equal(reproducesExport(old, withCore), true)
  assert.equal(reproducesExport(old, plan), true)
  assert.equal(reproducesExport(current, plan), false, 'an export may not gain a core the source does not declare')
  assert.equal(reproducesExport(old.replace('"names"', '"claims"'), withCore), false)
  assert.equal(reproducesExport(current.replace('"2.1"', '"3.0"'), withCore), false)
})
