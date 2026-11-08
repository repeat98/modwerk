import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, copyFile, mkdir, chmod, lstat, readdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { createFrontendTools } from './frontend-mcp.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const base = 'a'.repeat(64), active = 'b'.repeat(64), candidate = 'c'.repeat(64)
const savedSnapshots = () => [0, 1].map(slot => {
  const data = new Uint8Array(513).fill(slot + 17)
  data.set([0x4d, 0x57, 0x53, 0x54])
  return { status: 'ready', slot, token: slot + 1, length: data.length,
    sha256: createHash('sha256').update(data).digest('hex'), fileBase: Buffer.from(data.subarray(20, 52)).toString('hex'), data }
})
let frontend, manifest, tapehead

beforeAll(async () => {
  // Keep catalogue planning, inventory mapping and package validation real; only
  // the device's observable states and mutation responses are simulated below.
  const bundled = await build({ root, configFile: false, logLevel: 'silent', define: {
    'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'),
    'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
  }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false, minify: false, sourcemap: false } })
  const source = bundled.output.find(entry => entry.type === 'chunk' && entry.isEntry)?.code
  frontend = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  manifest = JSON.parse(await readFile(join(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8'))
  tapehead = manifest.packages.find(entry => entry.id === 'tapehead')
}, 30000)

class FakeLink {
  state = { status: 'ready', identity: { base, canSubmit: true }, active }
  modules = [{ module: '873d83cc', handle: 27, layout: 1 }]
  diagnostics = { state: 0, failed: 0, saved: 1 }
  selftests = 0
  refuse = false
  listeners = new Set()
  updates = []
  keeps = 0
  undos = 0
  failHealthOnce = false
  previous = undefined

  getState = () => this.state
  inventory = async () => structuredClone(this.modules)
  missing = async () => []
  health = async () => {
    if (this.failHealthOnce) { this.failHealthOnce = false; throw new Error('post-undo status unavailable') }
    return this.diagnostics && structuredClone(this.diagnostics)
  }
  liveLoad = async () => ({ ticks: 120, frames: 1000, cpu: 123, tracks1to4: 234, tracks5to8: 345, peak1to4: 456, peak5to8: 567 })
  savedBackup = async () => savedSnapshots()
  deviceLog = async () => ({ nonce: 77, boot: 3, seq: 9, loads: [{ seq: 9, boot: 3, minute: 5, cpu: [100, 200], dsp5to8: [1, 2], dsp1to4: [3, 4], samples: 300, playing: 1 }], incidents: [] })
  subscribeDiagnostics = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  selftest = async () => { this.selftests++; return null }
  update = async (name, changes) => {
    this.updates.push({ name, changes })
    if (this.refuse) { this.state = { ...this.state, status: 'ready', notice: { tone: 'error', text: 'The Octatrack refused this step.' } }; return }
    this.previous = { modules: structuredClone(this.modules), state: this.state }
    for (const change of changes) {
      const module = new DataView(change.data.buffer, change.data.byteOffset, change.data.byteLength).getUint32(28).toString(16).padStart(8, '0')
      this.modules = this.modules.filter(item => item.module !== module)
      if (change.data.length > 32) this.modules.push({ module, handle: 30, layout: 1 })
    }
    this.state = { ...this.state, status: 'trial', active: candidate }
  }
  undo = async () => {
    this.undos++
    this.modules = structuredClone(this.previous.modules)
    this.state = { ...this.previous.state, status: 'ready', notice: { tone: 'success', text: 'Undone.' } }
  }
  keep = async () => {
    this.keeps++
    this.state = { ...this.state, status: 'ready', notice: { tone: 'success', text: 'Kept.' } }
  }
}

describe('frontend MCP reviewed device transactions', () => {
  let folder, service, link, clock
  const requested = ['everb', 'tapehead']
  const review = () => service.call('device_review', { moduleIds: requested })
  const trial = async () => service.call('device_trial', { review: (await review()).review })

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-device-test-'))
    link = new FakeLink(); clock = 1000
    service = await createFrontendTools({ dataDir: folder, deviceSocket: 'test-only', allowDeviceWrites: true }, frontend, {
      openLink: async () => link, now: () => clock,
    })
  })
  afterEach(async () => { await service?.close(); await rm(folder, { recursive: true, force: true }) })

  async function bindTapeHead(requiredBase) {
    await service.close()
    // Startup-trusted test catalogue, still using the real preparation and real
    // package bytes. Tool callers cannot alter this source declaration.
    const bridge = { ...frontend, createRuntimeCatalogue: document => frontend.createRuntimeCatalogue({
      ...document, packages: document.packages.map(entry => entry.id === 'tapehead' ? { ...entry, requiredBase } : entry),
    }) }
    service = await createFrontendTools({ dataDir: folder, deviceSocket: 'test-only', allowDeviceWrites: true }, bridge, {
      openLink: async () => link, now: () => clock,
    })
  }

  it('uses only startup-selected prepared files, preserves baseline and requires observed base plus writes opt-in', async () => {
    await service.close()
    const preparedModules = join(folder, 'prepared')
    await mkdir(preparedModules, { mode: 0o700 })
    const bytes = Buffer.alloc(80)
    bytes.write('MWRM'); bytes.writeUInt16BE(8, 4); bytes.writeUInt32BE(4, 8)
    bytes.writeUInt32BE(createHash('sha256').update('cc-map').digest().readUInt32BE(0), 28)
    bytes.write('CC Map', 50); bytes.writeUInt16BE(1, 66)
    const version = frontend.modules.find(module => module.id === 'cc-map').version
    const extra = { id: 'cc-map', version, module: bytes.subarray(28, 32).toString('hex'), name: 'CC Map',
      abi: 8, features: 0, sites: 0, copies: 0, fills: 0, bytes: bytes.length, requiredBase: base,
      sha256: createHash('sha256').update(bytes).digest('hex'), path: `octatrack-modules/cc-map/${version}.mwrm` }
    // Every reviewed port is published now: prepare CC Map against a published list (the tools' root) without it.
    const published = { ...manifest, packages: manifest.packages.filter(entry => entry.id !== 'cc-map') }, unpublished = join(folder, 'root')
    await mkdir(join(unpublished, 'src/engine/assets'), { mode: 0o700, recursive: true })
    await writeFile(join(unpublished, 'src/engine/assets/octatrack-module-packages.json'), JSON.stringify(published), { mode: 0o600 })
    for (const entry of [...published.packages, extra]) {
      const path = join(preparedModules, entry.path)
      await mkdir(join(path, '..'), { mode: 0o700, recursive: true })
      if (entry === extra) await writeFile(path, bytes, { mode: 0o600 })
      else { await copyFile(join(root, 'public', entry.path), path); await chmod(path, 0o600) }
    }
    await writeFile(join(preparedModules, 'candidate-packages.json'), JSON.stringify({ schema: 1, preparation: true,
      base: { identity: base }, packages: [...published.packages, extra], held: [{ id: 'mute-modes', admission: false }] }), { mode: 0o600 })
    link.state.identity.capabilities = { abi: 8, features: 7, maxSites: 128, maxCopies: 128 }
    const open = allowDeviceWrites => createFrontendTools({ root: unpublished, dataDir: folder, deviceSocket: 'test-only', preparedModules,
      allowDeviceWrites }, frontend, { openLink: async () => link, now: () => clock })
    service = await open(false)
    const selected = ['everb', 'cc-map']
    const plan = await service.call('device_review', { moduleIds: selected })
    await expect(service.call('device_trial', { review: plan.review })).rejects.toThrow('--allow-device-writes')
    expect(link.updates).toHaveLength(0)
    await service.close(); service = await open(true)
    link.state.identity.base = 'b'.repeat(64)
    await expect(service.call('device_review', { moduleIds: selected })).rejects.toThrow('exact observed')
    await expect(service.call('device_review', { moduleIds: selected, preparedModules })).rejects.toThrow('Unexpected')
    expect(link.updates).toHaveLength(0)
    link.state.identity.base = base
    const trial = await service.call('device_trial', { review: (await service.call('device_review', { moduleIds: selected })).review })
    expect(link.updates[0].changes).toHaveLength(1)
    const result = await service.call('device_undo', { trial: trial.trial })
    expect(result.inventory.moduleIds).toEqual(['everb'])
    expect(link.keeps).toBe(0)
  })

  it('uses observed base identity for a bound physical review and exact Undo', async () => {
    await bindTapeHead(base)
    const result = await trial()
    expect(link.updates).toHaveLength(1)
    await service.call('device_undo', { trial: result.trial })
    expect(link.modules.map(item => item.module)).toEqual(['873d83cc'])
    expect(link.keeps).toBe(0)
  })

  it('keeps a caller-supplied planning base separate from actual device admission', async () => {
    const hypothetical = 'd'.repeat(64)
    await bindTapeHead(hypothetical)
    const plan = await service.call('site_selection', { moduleIds: requested, usb: true, base: hypothetical,
      current: { moduleIds: ['everb'], removedStockFx: [] } })
    expect(plan.changes).toHaveLength(1)
    await expect(review()).rejects.toThrow('exact Modwerk base')
    await expect(service.call('device_review', { moduleIds: requested, base: hypothetical })).rejects.toThrow()
    expect(link.updates).toHaveLength(0)
    expect(link.keeps).toBe(0)
  })

  it('reads cached live load without self-test, review, trial or device-write permission', async () => {
    await service.close()
    service = await createFrontendTools({ dataDir: folder, deviceSocket: 'test-only' }, frontend, { openLink: async () => link })
    const result = await service.call('device_load')
    expect(result).toMatchObject({ base, supported: true, reading: { cpu: 123, tracks1to4: 234, tracks5to8: 345 } })
    expect(service.tools.find(tool => tool.name === 'device_load').annotations.readOnlyHint).toBe(true)
    expect(link.updates).toHaveLength(0); expect(link.keeps).toBe(0); expect(link.undos).toBe(0)
    link.liveLoad = async () => undefined
    expect(await service.call('device_load')).toEqual({ base, supported: false, reading: null })
    link.liveLoad = async () => { link.state = { ...link.state, identity: { ...link.state.identity, base: 'd'.repeat(64) } }; return {} }
    await expect(service.call('device_load')).rejects.toThrow('changed during')
  })
  it('saves verified files privately without device-write permission and returns only a metadata receipt', async () => {
    await service.close()
    service = await createFrontendTools({ dataDir: folder, deviceSocket: 'test-only' }, frontend, { openLink: async () => link })
    await expect(service.call('device_saved_backup', { path: '/anywhere' })).rejects.toThrow('Unexpected')
    const receipt = await service.call('device_saved_backup')
    expect(receipt).toMatchObject({ base, active, supported: true, complete: true, recoveryVerified: false, cardWrites: false })
    expect(receipt.directory.startsWith(folder + '/saved-sets-')).toBe(true)
    expect((await lstat(receipt.directory)).mode & 0o077).toBe(0)
    for (const [slot, record] of receipt.files.entries()) {
      expect(await readFile(record.path)).toEqual(Buffer.from(savedSnapshots()[slot].data))
      expect((await lstat(record.path)).mode & 0o077).toBe(0)
      expect(record).not.toHaveProperty('data')
    }
    expect((await lstat(join(receipt.directory, 'receipt.json'))).mode & 0o077).toBe(0)
    expect(JSON.parse(await readFile(join(receipt.directory, 'receipt.json'), 'utf8'))).toEqual(receipt)
    expect(service.tools.find(tool => tool.name === 'device_saved_backup').annotations.destructiveHint).toBe(false)
    expect(link.updates).toHaveLength(0); expect(link.keeps).toBe(0); expect(link.undos).toBe(0)
  })
  it('does not infer absent files from an old base or a read failure', async () => {
    link.savedBackup = async () => undefined
    expect(await service.call('device_saved_backup')).toMatchObject({ supported: false, complete: false, recoveryVerified: false, files: [] })
    expect((await readdir(folder)).filter(name => name.startsWith('saved-sets-'))).toHaveLength(0)
    link.savedBackup = async () => [{ status: 'read-failed', slot: 0, token: 1, length: 0, sha256: '0'.repeat(64), fileBase: '0'.repeat(64) }, savedSnapshots()[1]]
    const receipt = await service.call('device_saved_backup')
    expect(receipt.complete).toBe(false)
    expect(receipt.files[0]).toEqual({ slot: 0, name: 'MODWERK0.SET', status: 'read-failed', absent: false })
    expect(receipt.files[1].status).toBe('ready')
    expect(await readdir(receipt.directory)).toEqual(['MODWERK1.SET', 'receipt.json'])
  })
  it.each(['identity', 'hash', 'slot', 'size', 'base-header'])('rejects altered %s before creating private backup files', async field => {
    link.savedBackup = async () => {
      const snapshots = savedSnapshots()
      if (field === 'identity') link.state = { ...link.state, active: 'd'.repeat(64) }
      if (field === 'hash') snapshots[0].data[60] ^= 1
      if (field === 'slot') snapshots[0].slot = 1
      if (field === 'size') snapshots[0].length++
      if (field === 'base-header') snapshots[0].fileBase = '0'.repeat(64)
      return snapshots
    }
    await expect(service.call('device_saved_backup')).rejects.toThrow()
    expect((await readdir(folder)).filter(name => name.startsWith('saved-sets-'))).toHaveLength(0)
  })
  it('refuses a replacement workspace even when it has private permissions', async () => {
    const moved = folder + '-owned-original'
    await rename(folder, moved); await mkdir(folder, { mode: 0o700 })
    try {
      await expect(service.call('device_saved_backup')).rejects.toThrow('workspace changed')
      expect(await readdir(folder)).toEqual([])
      expect(await readdir(moved)).toEqual(['.mcp-lock'])
    } finally { await rm(folder, { recursive: true }); await rename(moved, folder) }
  })

  it('preserves the legacy E-Verb baseline and sends only the verified TapeHead addition with its removal Undo', async () => {
    await expect(service.call('device_review', { moduleIds: ['tapehead'] })).rejects.toThrow('Preserve')
    expect(link.updates).toHaveLength(0)
    const plan = await review()
    expect(plan.changes).toEqual([{ module: 'TapeHead', sha256: tapehead.sha256, undoAvailable: true }])
    const result = await service.call('device_trial', { review: plan.review })
    expect(link.updates).toHaveLength(1)
    const changes = link.updates[0].changes
    expect(changes).toHaveLength(1)
    expect(changes[0].data).toEqual(new Uint8Array(await readFile(join(root, 'public', tapehead.path))))
    expect(changes[0].undo).toHaveLength(32)
    expect(new DataView(changes[0].undo.buffer).getUint32(28)).toBe(Number.parseInt(tapehead.module, 16))
    expect(link.keeps).toBe(0)
    const undone = await service.call('device_undo', { trial: result.trial })
    expect(undone.inventory.moduleIds).toEqual(['everb'])
    expect(undone.state.active).toBe(active)
    expect(link.undos).toBe(1)
  })

  it.each(['base', 'active', 'inventory'])('rejects a stale %s review before any mutation', async field => {
    const plan = await review()
    if (field === 'base') link.state = { ...link.state, identity: { ...link.state.identity, base: 'd'.repeat(64) } }
    if (field === 'active') link.state = { ...link.state, active: 'd'.repeat(64) }
    if (field === 'inventory') link.modules.push({ module: '3cbedc9c', handle: 31, layout: 1 })
    await expect(service.call('device_trial', { review: plan.review })).rejects.toThrow('changed after review')
    expect(link.updates).toHaveLength(0)
    expect(link.undos).toBe(0)
    expect(link.keeps).toBe(0)
    await expect(service.call('device_trial', { review: plan.review })).rejects.toThrow('expired')
  })

  it('expires reviewed plans using the injected clock and sends nothing', async () => {
    const plan = await review()
    clock += 60001
    await expect(service.call('device_trial', { review: plan.review })).rejects.toThrow('expired')
    expect(link.updates).toHaveLength(0)
    expect(link.undos).toBe(0)
    expect(link.keeps).toBe(0)
  })

  it('refuses a multiple-change review on an older base before sending anything', async () => {
    await expect(service.call('device_review', { moduleIds: ['everb', 'tapehead', 'airwindows-chorus'] })).rejects.toThrow(/base/i)
    expect(link.updates).toHaveLength(0)
    expect(link.keeps).toBe(0)
    expect(link.undos).toBe(0)
    expect((await service.call('device_status')).inventory.moduleIds).toEqual(['everb'])
  })
  it('reviews, trials and Undoes several changes as one set on a capable base', async () => {
    link.state.identity.capabilities = { abi: 8, features: 7 | 512, maxSites: 128, maxCopies: 128 }
    const plan = await service.call('device_review', { moduleIds: ['tapehead', 'airwindows-chorus'] })
    expect(plan.changes).toHaveLength(3)
    const started = await service.call('device_trial', { review: plan.review })
    expect(started.state.status).toBe('trial')
    expect(link.updates).toHaveLength(1); expect(link.keeps).toBe(0)
    await service.call('device_undo', { trial: started.trial })
    expect(link.undos).toBe(1); expect(link.keeps).toBe(0)
    expect((await service.call('device_status')).inventory.moduleIds).toEqual(['everb'])
  })

  it('requires a self-test status endpoint before even preparing a device trial', async () => {
    link.diagnostics = undefined
    await expect(review()).rejects.toThrow('self-test status')
    expect(link.updates).toHaveLength(0)
  })

  it('installs a trial without running a self-test, as a site sync does', async () => {
    const started = await trial()
    expect(started.trial).toBeTypeOf('string')
    expect(link.selftests).toBe(0)
    expect(link.undos).toBe(0)
    await service.call('device_keep', { trial: started.trial })
    expect(link.keeps).toBe(1)
    expect(link.selftests).toBe(0)
  })

  it('reports a trial the unit did not start, and leaves no trial to keep', async () => {
    link.refuse = true
    await expect(trial()).rejects.toThrow('did not start: The Octatrack refused this step.')
    expect(link.updates).toHaveLength(1)
    expect(link.keeps).toBe(0)
    expect((await service.call('device_status')).inventory.moduleIds).toEqual(['everb'])
  })

  it('consumes the Undo token after restoration even when the completion status read fails', async () => {
    const result = await trial()
    link.failHealthOnce = true
    await service.call('device_undo', { trial: result.trial }).catch(error => {
      expect(error.message).toContain('post-undo status unavailable')
    })
    expect(link.undos).toBe(1)
    expect(link.state.status).toBe('ready')
    expect((await service.call('device_status')).inventory.moduleIds).toEqual(['everb'])
    await expect(service.call('device_undo', { trial: result.trial })).rejects.toThrow('matching authorized')
    expect((await review()).review).toBeTypeOf('string')
    expect(link.undos).toBe(1)
  })

  it('rejects the wrong Keep token and never accepts a trial automatically', async () => {
    const result = await trial()
    await expect(service.call('device_keep', { trial: 'not-the-issued-token' })).rejects.toThrow('matching authorized')
    expect(link.keeps).toBe(0)
    expect(link.state.status).toBe('trial')
    await service.call('device_undo', { trial: result.trial })
    expect(link.undos).toBe(1)
  })

  it('accepts only an explicitly requested matching Keep token, once', async () => {
    const result = await trial()
    const kept = await service.call('device_keep', { trial: result.trial })
    expect(kept.kept).toBe(true)
    expect(kept.inventory.moduleIds).toEqual(requested)
    expect(link.keeps).toBe(1)
    await expect(service.call('device_keep', { trial: result.trial })).rejects.toThrow('matching authorized')
    expect(link.keeps).toBe(1)
  })
  it('refuses Keep over foreign saved files while leaving the exact trial Undo available', async () => {
    link.diagnostics = { state: 0, failed: 0, saved: 4 }
    const result = await trial()
    await expect(service.call('device_saved_backup')).rejects.toThrow('Finish the current trial')
    await expect(service.call('device_keep', { trial: result.trial })).rejects.toThrow('saved files from another base')
    expect(link.keeps).toBe(0); expect(link.state.status).toBe('trial')
    await service.call('device_undo', { trial: result.trial })
    expect(link.undos).toBe(1); expect(link.state.active).toBe(active)
  })

  it('requires startup write authorization even with a valid reviewed plan', async () => {
    await service.close()
    service = await createFrontendTools({ dataDir: folder, deviceSocket: 'test-only' }, frontend, {
      openLink: async () => link, now: () => clock,
    })
    const plan = await review()
    await expect(service.call('device_trial', { review: plan.review })).rejects.toThrow('--allow-device-writes')
    await expect(service.call('device_keep', { trial: 'anything' })).rejects.toThrow('matching authorized')
    await expect(service.call('device_undo', { trial: 'anything' })).rejects.toThrow('matching authorized')
    expect(link.updates).toHaveLength(0)
    expect(link.keeps).toBe(0)
    expect(link.undos).toBe(0)
  })
})

describe('frontend MCP remote sessions', () => {
  let folder, service, calls, relay
  const id = '0f0e0d0c-0b0a-4908-8706-050403020100'
  const reply = (path, init = {}) => {
    calls.push({ path, method: init.method ?? 'GET', origin: new Headers(init.headers).get('Origin'), body: init.body && JSON.parse(init.body) })
    if (path === '/admin/remote-sessions') return Response.json({ session: { id, status: 'pending' } }, { status: 201 })
    if (path.endsWith('/ticket')) return Response.json({ ticket: 'f'.repeat(64), endsAt: '2026-10-20T12:30:00.000Z' })
    if (init.method === 'DELETE') return Response.json({ ok: true })
    return Response.json({ session: { id, status: 'active' } })
  }
  const open = (options = {}) => createFrontendTools({ dataDir: folder, allowApiWrites: true, site: 'https://modwerk.app/', ...options }, { ...frontend, apiFetch: async (path, init) => reply(path, init) }, {
    openLink: async () => new FakeLink(),
    openRemote: url => { relay = { url, said: [], ended: false, ready: Promise.resolve(), state: () => ({ member: true, unit: true, ended: relay.ended ? 'operator' : null }), say: text => relay.said.push(text), end: () => { relay.ended = true } }; return relay },
  })
  beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-remote-test-')); calls = []; relay = undefined; service = await open() })
  afterEach(async () => { await service?.close(); await rm(folder, { recursive: true, force: true }) })

  it('asks only with the API write opt-in and confirmation, naming the trusted site', async () => {
    await expect(service.call('remote_session_request', { username: 'member', reason: 'Read the log.', confirm: false })).rejects.toThrow(/confirm=true/)
    expect(await service.call('remote_session_request', { username: 'member', reason: 'Read the log.', minutes: 15, confirm: true })).toMatchObject({ session: { id, status: 'pending' } })
    expect(calls).toEqual([{ path: '/admin/remote-sessions', method: 'POST', origin: 'https://modwerk.app', body: { username: 'member', reason: 'Read the log.', minutes: 15 } }])
    await service.close(); service = await open({ allowApiWrites: false })
    await expect(service.call('remote_session_request', { username: 'member', reason: 'Read the log.', confirm: true })).rejects.toThrow(/allow-api-writes/)
  })
  it('reads the member’s unit through an accepted session and refuses every write', async () => {
    await expect(service.call('device_status')).rejects.toThrow(/remote session/)
    expect(await service.call('remote_session_connect', { session: id })).toMatchObject({ connected: true, member: true, unit: true })
    expect(relay.url).toBe('ws://127.0.0.1:8788/api/remote-sessions/' + id + '/socket?ticket=' + 'f'.repeat(64))
    expect(calls.at(-1)).toMatchObject({ path: `/admin/remote-sessions/${id}/ticket`, method: 'POST' })
    expect(await service.call('device_status')).toMatchObject({ state: { status: 'ready', identity: { base } } })
    expect(await service.call('device_load')).toMatchObject({ base, supported: true })
    const { log } = await service.call('device_log')
    expect(log).toMatchObject({ boot: 3, seq: 9, loads: [{ minute: 5 }] })
    expect(log.nonce).toBeUndefined()
    await expect(service.call('device_saved_backup')).rejects.toThrow(/read-only/)
    await expect(service.call('device_trial', { review: 'x' })).rejects.toThrow(/read-only/)
    await expect(service.call('device_keep', { trial: 'x' })).rejects.toThrow(/read-only/)
    await service.call('remote_session_say', { text: 'Please plug the Octatrack back in.' })
    expect(relay.said).toEqual(['Please plug the Octatrack back in.'])
    expect(await service.call('remote_session_end')).toEqual({ ended: id })
    expect(relay.ended).toBe(true)
    expect(calls.at(-1)).toMatchObject({ path: `/admin/remote-sessions/${id}`, method: 'DELETE' })
    await expect(service.call('device_status')).rejects.toThrow(/remote session/)
  })
  it('refuses a malformed session id before calling the API', async () => {
    await expect(service.call('remote_session_connect', { session: '../auth' })).rejects.toThrow(/session id/)
    expect(calls).toEqual([])
  })
})
