// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only by default; uses the frontend MCP service's actual catalogue and USB tools.
import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

export const DSP_MODULES = ['everb', 'miniverb', 'tapehead', 'airwindows-chorus']
export const STAGED_MODULES = [...DSP_MODULES, 'previewvol', 'repitch']
const TOOLS = new Set(['site_catalogue', 'site_selection', 'device_status', 'device_review', 'device_trial', 'device_undo'])
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const sortedIds = values => {
  assert.ok(Array.isArray(values) && values.every(value => typeof value === 'string') && new Set(values).size === values.length, 'Invalid device module inventory.')
  return [...values].sort()
}
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const inventory = value => ({ ...value, moduleIds: sortedIds(value.moduleIds), removedStockFx: sortedIds(value.removedStockFx ?? []) })
function ready(value) {
  assert.equal(value.state?.status, 'ready', 'The Octatrack connection must be ready before verification.')
  assert.equal(value.state.identity?.canSubmit, true, 'The connected unit cannot accept module trials.')
  assert.ok(digest(value.state.identity.base) && digest(value.state.active), 'The connected base and active identity must be known.')
  inventory(value.inventory)
  return value
}
function restored(value, baseline) {
  ready(value)
  assert.equal(value.state.identity.base, baseline.state.identity.base, 'The base changed; stop and inspect the unit.')
  assert.equal(value.state.active, baseline.state.active, 'Undo did not restore the starting active identity.')
  assert.equal(canonical(inventory(value.inventory)), canonical(inventory(baseline.inventory)), 'Undo did not restore the starting inventory.')
  if (baseline.diagnostics?.savedCount !== undefined) assert.equal(value.diagnostics?.savedCount, baseline.diagnostics.savedCount, 'The saved module count changed during a trial-only test.')
}
export const verifierTools = service => (name, args) => {
  assert.ok(TOOLS.has(name), 'This verifier cannot Keep modules or call unrelated tools.')
  return service.call(name, args)
}

/** Legacy inventory cannot identify installed package bytes, so all targets retain the starting set. */
export async function verifyModuleSets(call, { allStaged = false, trial = false, wholeSet = false, expectBase } = {}) {
  if (trial) assert.ok(digest(expectBase), '--trial requires the exact 64-character --expect-base identity.')
  if (expectBase !== undefined) assert.ok(digest(expectBase), 'Invalid --expect-base identity.')
  const listed = await call('site_catalogue', { machine: 'octatrack', beta: true }), requested = allStaged ? STAGED_MODULES : DSP_MODULES
  for (const id of requested) assert.ok(listed.modules?.some(module => module.id === id && module.usb), `${id} is not a staged USB package in the selected frontend root.`)
  const baseline = ready(await call('device_status', {}))
  if (expectBase) assert.equal(baseline.state.identity.base, expectBase, 'The connected base does not match --expect-base; nothing was sent.')
  const baselineIds = sortedIds(baseline.inventory.moduleIds), union = ids => [...new Set([...baselineIds, ...ids])].sort()
  const targets = requested.filter(id => !baselineIds.includes(id)).map(id => ({ id, moduleIds: union([id]) }))
  const selection = moduleIds => call('site_selection', { usb: true, beta: true, moduleIds, current: baseline.inventory, capabilities: baseline.capabilities })
  const fullSet = await selection(union(requested))
  if (wholeSet) assert.ok(baseline.capabilities?.features & 512, 'Whole-set verification needs a base with module-set transactions; nothing was sent.')
  // Check every package with actual connected capabilities before the first possible write.
  for (const target of targets) {
    const prepared = await selection(target.moduleIds)
    assert.equal(prepared.changes?.length, 1, 'Trial-only verification requires exactly one package change.')
    assert.ok(digest(prepared.changes[0].sha256) && digest(prepared.changes[0].undoSha256), 'An intact package and exact Undo must be available.')
    target.packageSha256 = prepared.changes[0].sha256
  }
  const receipt = {
    mode: trial ? wholeSet ? 'whole-set-trial' : 'single-package-trials' : 'read-only-preflight', base: baseline.state.identity.base,
    startingActive: baseline.state.active, startingModules: baselineIds, capabilities: baseline.capabilities ?? null,
    fullSet: { moduleIds: union(requested), preparedChanges: fullSet.changes?.length, physicalTrial: false },
    packages: targets.map(target => ({ id: target.id, sha256: target.packageSha256, trialPassed: false, undoVerified: false })),
    kept: false, audioVerified: false, rebootVerified: false,
  }
  if (!trial) return receipt
  if (wholeSet) {
    assert.ok(targets.length, 'The requested modules are already installed; no whole-set change to verify.')
    restored(await call('device_status', {}), baseline)
    const review = await call('device_review', { moduleIds: union(requested) })
    assert.equal(review.base, baseline.state.identity.base, 'The base changed after preflight; nothing was sent.')
    assert.equal(review.active, baseline.state.active, 'The installed set changed after preflight; nothing was sent.')
    assert.deepEqual(review.changes?.map(change => change.sha256), fullSet.changes?.map(change => change.sha256), 'The reviewed packages changed after preflight; nothing was sent.')
    let started, undone
    try {
      started = await call('device_trial', { review: review.review })
      assert.ok(typeof started.trial === 'string' && started.trial.length > 0, 'No successful trial was returned.')
      assert.equal(started.state?.status, 'trial', 'The complete set did not remain unaccepted.')
      assert.equal(started.state.identity?.base, baseline.state.identity.base, 'The trial base changed.')
      receipt.fullSet.physicalTrial = true
      receipt.packages.forEach(item => { item.trialPassed = true })
    } finally { if (started?.trial) undone = await call('device_undo', { trial: started.trial }) }
    restored(undone, baseline)
    restored(await call('device_status', {}), baseline)
    receipt.packages.forEach(item => { item.undoVerified = true })
    return receipt
  }
  for (const [index, target] of targets.entries()) {
    restored(await call('device_status', {}), baseline)
    const review = await call('device_review', { moduleIds: target.moduleIds })
    assert.equal(review.base, baseline.state.identity.base, 'The base changed after preflight; nothing was sent.')
    assert.equal(review.active, baseline.state.active, 'The installed set changed after preflight; nothing was sent.')
    assert.equal(review.changes?.length, 1, 'Single-package verification received several changes; nothing was sent.')
    assert.equal(review.changes[0].sha256, target.packageSha256, 'The package changed after preflight; nothing was sent.')
    assert.equal(review.changes[0].undoAvailable, true, 'Exact Undo is unavailable; nothing was sent.')
    let started, undone
    try {
      started = await call('device_trial', { review: review.review })
      assert.ok(typeof started.trial === 'string' && started.trial.length > 0, 'No successful trial was returned.')
      assert.equal(started.state?.status, 'trial', 'The trial did not remain unaccepted.')
      assert.equal(started.state.identity?.base, baseline.state.identity.base, 'The trial base changed.')
      receipt.packages[index].trialPassed = true
    } finally { if (started?.trial) undone = await call('device_undo', { trial: started.trial }) }
    restored(undone, baseline)
    restored(await call('device_status', {}), baseline)
    receipt.packages[index].undoVerified = true
  }
  return receipt
}

export async function main(args, openService) {
  const { values } = parseArgs({ args, options: {
    socket: { type: 'string' }, 'data-dir': { type: 'string' }, 'mcp-server': { type: 'string' },
    'frontend-root': { type: 'string' }, 'all-staged': { type: 'boolean' }, trial: { type: 'boolean' }, 'whole-set': { type: 'boolean' },
    'expect-base': { type: 'string' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log('Usage: node scripts/verify-octatrack-module-sets.mjs --socket SOCKET --data-dir PRIVATE_DIR [--mcp-server FILE] [--frontend-root CHECKOUT] [--all-staged] [--whole-set] [--trial --expect-base SHA256]\nDefault: read-only package/capability preflight. Trials add one package at a time, self-test and Undo; --whole-set trials all additions in one transaction on a capable base. Never Keeps, flashes, reboots or edits Parts. Audio and reboot persistence need separate qualification.')
    return
  }
  assert.ok(values.socket && values['data-dir'], '--socket and an isolated --data-dir are required.')
  if (values.trial) assert.ok(digest(values['expect-base']), '--trial requires the exact --expect-base identity before starting the service.')
  const root = resolve(values['frontend-root'] ?? fileURLToPath(new URL('../', import.meta.url)))
  const server = resolve(values['mcp-server'] ?? fileURLToPath(new URL('./frontend-mcp.mjs', import.meta.url)))
  const create = openService ?? (await import(pathToFileURL(server).href)).createFrontendTools
  const service = await create({ root, dataDir: resolve(values['data-dir']), deviceSocket: values.socket, allowDeviceWrites: !!values.trial })
  let receipt
  try { receipt = await verifyModuleSets(verifierTools(service), { allStaged: values['all-staged'], wholeSet: values['whole-set'], trial: values.trial, expectBase: values['expect-base'] }) }
  finally { await service.close() }
  console.log(JSON.stringify(receipt, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(() => { console.error('Module-set verification failed; no successful hardware receipt was recorded. Inspect the connected unit before another trial.'); process.exitCode = 1 })
