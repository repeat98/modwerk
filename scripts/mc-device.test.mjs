import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { packSection } from '../src/engine/aplib'
import { contentChecksum, encodeSyx } from '../src/engine/elektron/sysex'
import { ELE3_DEVICES } from '../src/engine/elektron/ele3'
import { createFrontendTools } from './frontend-mcp.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
// A generated Model:Cycles container, no firmware bytes: its image's last bytes stand for the linked .run block.
function syx(seed) {
  const image = Uint8Array.from({ length: 512 }, (_, i) => (i * seed) % 251), packed = packSection(image)
  const container = new Uint8Array(64 + packed.length + (-packed.length & 15)), view = new DataView(container.buffer)
  container.set([0x45, 0x4c, 0x45, 0x33])
  view.setUint32(0x1c, 1); view.setUint32(0x20, 3); view.setUint32(0x24, 64); view.setUint32(0x28, packed.length); view.setUint32(0x2c, 0x40000400)
  container.set(packed, 64)
  const stream = new Uint8Array(8 + container.length), streamView = new DataView(stream.buffer)
  streamView.setUint32(0, container.length); streamView.setUint32(4, contentChecksum(container)); stream.set(container, 8)
  const id = ELE3_DEVICES['model-cycles'].sysexId, framing = Uint8Array.from([0xf0, 0, 0x20, 0x3c, id, 0, 0x7d, 0, 0x10, 1, 2, 3, 0, 0, 0, 0xf7])
  return encodeSyx(stream, id, framing, framing)
}
const put32 = v => [0, 1, 2, 3, 4].map(i => v >>> 7 * i & 0x7f)
const get32 = (p, at) => (p[at] | p[at + 1] << 7 | p[at + 2] << 14 | p[at + 3] << 21 | (p[at + 4] & 0x0f) << 28) >>> 0
const pack7 = data => { const out = []; for (let i = 0; i < data.length; i += 7) { const c = data.subarray(i, i + 7); out.push(c.reduce((t, b, k) => t | (b & 0x80 ? 0x40 >> k : 0), 0), ...Array.from(c, b => b & 0x7f)) } return out }
const LOG_AT = 0x47e02404
// diag.h's log, big-endian: START and BASE, one load record (a made-up log, no unit's).
function logBytes() {
  const bytes = new Uint8Array(6148), v = new DataView(bytes.buffer)
  ;[0x4d574447, 2, 0xabcd, 1, 3, 1, 2].forEach((x, i) => v.setUint32(4 * i, x))
  const load = 40 + 92, incident = load + 32 * 96
  ;[3, 1, 5].forEach((x, i) => v.setUint32(load + 4 * i, x)); ;[738, 829, 0, 0, 0, 0, 600, 0, 714, 53].forEach((x, i) => v.setUint16(load + 12 + 2 * i, x))
  ;[[1, 1, 0], [2, 7, 0x4f182a66]].forEach(([seq, kind, a], n) => { const at = incident + 92 * n; v.setUint32(at, seq); v.setUint32(at + 4, 1); v.setUint32(at + 12, a); v.setUint16(at + 16, kind) })
  return bytes
}
// A unit with a Modwerk base: answers ident with the given set identity, load (0x23) with the given tenths of a
// percent and counts (link.c CMD_LOAD), and diag (0x22) and log (0x24) with a log; without them, as a base before the load
// probe or the log (status 2, bad request).
// With `loader`, the base's own upload transport, controller and runtime loader compiled for the host
// (base/test_modules.c): up_part (0x31) and up_run (0x32) go to it, mods (0x33) answers an empty pool.
function fakeCycles(set, name = 'Elektron Model:Cycles', load = null, log = null, loader = null) {
  const input = { id: 'i', name, state: 'connected', onmidimessage: null }
  const fields = [1, 1, 0, 146, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, ...(set ? [set.crc, set.bytes] : [])]
  const answer = (data, status, reply) => input.onmidimessage?.({ data: Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, data[6], data[7] | 0x40, status, ...reply, 0xf7]) })
  const output = { id: 'o', name, state: 'connected', send(data) {
    const body = data.slice(8, -1)
    if (data[7] >= 0x31 && data[7] <= 0x33) {
      if (!loader) { queueMicrotask(() => answer(data, 2, [])); return }
      const line = data[7] === 0x31 ? 'P ' + get32(body, 0) + ' ' + Buffer.from(Uint8Array.from(body).subarray(5)).toString('hex') : data[7] === 0x32 ? 'R ' + get32(body, 0) : null
      if (!line) { queueMicrotask(() => answer(data, 0, pack7(Uint8Array.from([0, 0, 0xfe, 0x60, 0, 0, 0xfe, 0x60, 0, 0, 0, 0, 0, 0, 0, 0, 0x4d, 0x57, 0x49, 0])))); return }
      loader.ask(line).then(out => answer(data, data[7] === 0x31 ? (Number(out) ? 0 : 4) : out ? 0 : 4, data[7] === 0x31 || !out ? [] : pack7(Uint8Array.from(Buffer.from(out, 'hex')))))
      return
    }
    const [status, reply] = data[7] === 0x23 ? (load ? [0, load.flatMap(put32)] : [2, []])
      : data[7] === 0x22 ? (log ? [0, [LOG_AT, log.length].flatMap(put32)] : [2, []])
      : data[7] === 0x24 ? (!log ? [2, []] : (() => { const at = get32(body, 0), n = get32(body, 5); return at + n > log.length ? [4, []] : [0, [...put32(at), ...put32(n), ...pack7(log.subarray(at, at + n))]] })())
      : [0, fields.flatMap(put32)]
    queueMicrotask(() => answer(data, status, reply))
  } }
  return { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]), onstatechange: null, close() {} }
}

describe('the developer MCP’s Model:Cycles identity', () => {
  let frontend, folder, images, service
  beforeAll(async () => {
    const bundled = await build({ root, configFile: false, logLevel: 'silent', define: {
      'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'), 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
    }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false, minify: false, sourcemap: false } })
    frontend = await import('data:text/javascript;base64,' + Buffer.from(bundled.output.find(entry => entry.type === 'chunk' && entry.isEntry).code).toString('base64'))
  }, 60000)
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-cycles-test-')); images = await mkdtemp(join(tmpdir(), 'modwerk-cycles-images-'))
    await writeFile(join(images, 'a-other.syx'), syx(3)); await writeFile(join(images, 'b-built.syx'), syx(7)); await writeFile(join(images, 'notes.txt'), 'x')
  })
  afterEach(async () => { await service?.close(); service = undefined; await rm(folder, { recursive: true, force: true }); await rm(images, { recursive: true, force: true }) })
  const open = (access, options = {}) => createFrontendTools({ dataDir: folder, elektronMidi: true, elektronImages: images, ...options }, frontend, { elektronAccess: async () => access })

  it('reads the link identity and names the image whose set the unit runs', async () => {
    const set = frontend.mcSetIdentity(syx(7), 64)
    service = await open(fakeCycles(set))
    const status = await service.call('device_status')
    expect(status).toMatchObject({ machine: 'model-cycles', state: { status: 'ready', identity: { linkVersion: 1, port: 'USB', set } }, inventory: null })
    expect(status.build).toMatchObject({ file: 'b-built.syx' })
    expect(status.build.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('names no build when none matches or the base is older, and says what a missing unit needs', async () => {
    service = await open(fakeCycles({ crc: 1, bytes: 64 }))
    expect((await service.call('device_status')).build).toBeNull()
    await service.close(); service = await open(fakeCycles(null))
    expect(await service.call('device_status')).toMatchObject({ build: null, state: { identity: { set: null } } })
    await service.close(); service = await open(fakeCycles(null, 'IAC Driver Bus 1'))
    await expect(service.call('device_status')).rejects.toThrow(/No Model:Cycles answered/)
  })
  it('reads the audio load, and reports an older base without the probe as unsupported', async () => {
    service = await open(fakeCycles(null, undefined, [738, 801, 849, 12, 9000]))
    expect(await service.call('device_load')).toEqual({ machine: 'model-cycles', supported: true,
      reading: { windowPercent: 73.8, windowPeakPercent: 80.1, peakPercent: 84.9, windows: 12, blocks: 9000 } })
    await service.close(); service = await open(fakeCycles(null, undefined, [0, 0, 812, 0, 400]))
    expect((await service.call('device_load')).reading).toEqual({ windowPercent: null, windowPeakPercent: null, peakPercent: 81.2, windows: 0, blocks: 400 })
    await service.close(); service = await open(fakeCycles(null))
    expect(await service.call('device_load')).toEqual({ machine: 'model-cycles', supported: false, reading: null })
    await service.close(); service = await open(fakeCycles(null, 'IAC Driver Bus 1'))
    await expect(service.call('device_load')).rejects.toThrow(/No Model:Cycles answered/)
  })
  it('reads the diagnostics log through diag and mem, and reports an older base without it as unsupported', async () => {
    service = await open(fakeCycles(null, undefined, null, logBytes()))
    const { machine, supported, log } = await service.call('device_log')
    expect({ machine, supported, boot: log.boot, seq: log.seq }).toEqual({ machine: 'model-cycles', supported: true, boot: 1, seq: 3 })
    expect(log.loads).toEqual([{ seq: 3, boot: 1, minute: 5, cpu: [738, 829], dsp1to4: [0, 0], dsp5to8: [0, 0], samples: 600, playing: 0, frameGap: 714, tickGap: 53 }])
    expect(log.incidents.map(i => [i.kind, i.a])).toEqual([['start', 0], ['base', 0x4f182a66]])
    expect(log).not.toHaveProperty('nonce')
    await service.close(); service = await open(fakeCycles(null))
    expect(await service.call('device_log')).toEqual({ machine: 'model-cycles', supported: false, log: null })
  })
  it('reports an older base without the loader, and takes one change a trial', async () => {
    service = await open(fakeCycles({ crc: 1, bytes: 64 }), { allowDeviceWrites: true })
    expect((await service.call('device_status')).loader).toBe('unsupported')
    await expect(service.call('device_review', { moduleIds: [] })).rejects.toThrow(/one change a trial/)
    await expect(service.call('device_review', { moduleIds: ['../x.mwrm'] })).rejects.toThrow(/NAME.mwrm/)
    await expect(service.call('device_review', { moduleIds: ['notes.txt'] })).rejects.toThrow(/NAME.mwrm/)
  })
  // The base's transport, controller and loader on the host (the harness sdk/tests/test_machine_base.py runs): its base
  // identity is the SHA-256 of the set CRC 0x12345678.
  const cc = spawnSync('cc', ['--version']).status === 0
  it.skipIf(!cc)('reviews a package, puts it on trial, undoes it and keeps it, through the base\'s own loader', async () => {
    const base = join(root, 'sdk/machines/model-cycles/elekloader/base'), rt = join(root, 'sdk/runtime')
    const exe = join(folder, 'loader')
    const built = spawnSync('cc', ['-std=c99', '-DMODWERK_HOST', '-DRUNTIME_MODULES=16u', '-DRUNTIME_POOL_BYTES=65536u', '-I', join(rt, 'loader'), '-I', join(rt, 'upload'),
      join(base, 'test_modules.c'), join(base, 'modules.c'), join(base, 'runtime.c'), join(rt, 'loader/loader.c'), join(rt, 'upload/upload.c'),
      join(rt, 'upload/wire.c'), join(rt, 'upload/sha256.c'), '-o', exe])
    expect(built.status, String(built.stderr)).toBe(0)
    const child = spawn(exe), lines = createInterface({ input: child.stdout }), waiting = []
    lines.on('line', line => waiting.shift()?.(line))
    let chain = Promise.resolve()
    const loader = { ask: line => (chain = chain.then(() => new Promise(resolve => { waiting.push(resolve); child.stdin.write(line + '\n') }))) }
    try {
      // ABI 4: a tick hook that returns at once
      const pkg = Buffer.concat([Buffer.from('MWRM'), Buffer.from([0, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0x59, 0x4c, 0xfd, 0x26]),
        Buffer.alloc(4), Buffer.from([0x4e, 0x75, 0x4e, 0x71])])
      await writeFile(join(images, 'frames.mwrm'), pkg)
      service = await open(fakeCycles({ crc: 0x12345678, bytes: 64 }, undefined, null, null, loader), { allowDeviceWrites: true })
      expect((await service.call('device_status')).loader).toMatchObject({ free: 65120, active: 0, modules: [] })
      const review = await service.call('device_review', { moduleIds: ['frames.mwrm'] })
      expect(review).toMatchObject({ machine: 'model-cycles', changes: [{ module: 'frames.mwrm', bytes: pkg.length, undoAvailable: true }] })
      expect(review.base).toBe(frontend.mcUploadBase(0x12345678))
      const trial = await service.call('device_trial', { review: review.review })
      expect(trial.state.phase).toBe('trial')
      await expect(service.call('device_trial', { review: review.review })).rejects.toThrow(/current trial/)
      const undone = await service.call('device_undo', { trial: trial.trial })
      expect(undone).toMatchObject({ kept: false, completed: true, phase: 'normal', active: review.active })
      const again = await service.call('device_trial', { review: (await service.call('device_review', { moduleIds: ['frames.mwrm'] })).review })
      const kept = await service.call('device_keep', { trial: again.trial })
      expect(kept).toMatchObject({ kept: true, completed: true, phase: 'normal' })
      expect(kept.active).not.toBe(review.active)
      await expect(service.call('device_keep', { trial: again.trial })).rejects.toThrow(/No matching/)
    } finally { child.stdin.end() }
  }, 30000)
})
