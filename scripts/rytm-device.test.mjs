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
// A generated Analog Rytm MKII container, no firmware bytes: its image ends with a stand-in .run block and, with `lock`,
// the storage lockfile the linker appends after it (ELKSTORE, a big-endian length, the text).
function syx(seed, lock = null) {
  const body = Uint8Array.from({ length: 512 }, (_, i) => (i * seed) % 251)
  const tail = lock ? new TextEncoder().encode(lock) : new Uint8Array()
  const image = new Uint8Array(body.length + (lock ? 12 + tail.length : 0))
  image.set(body)
  if (lock) { image.set(new TextEncoder().encode('ELKSTORE'), body.length); new DataView(image.buffer).setUint32(body.length + 8, tail.length); image.set(tail, body.length + 12) }
  const packed = packSection(image)
  const container = new Uint8Array(64 + packed.length + (-packed.length & 15)), view = new DataView(container.buffer)
  container.set([0x45, 0x4c, 0x45, 0x33])
  view.setUint32(0x1c, 1); view.setUint32(0x20, 3); view.setUint32(0x24, 64); view.setUint32(0x28, packed.length); view.setUint32(0x2c, 0x40000400)
  container.set(packed, 64)
  const stream = new Uint8Array(8 + container.length), streamView = new DataView(stream.buffer)
  streamView.setUint32(0, container.length); streamView.setUint32(4, contentChecksum(container)); stream.set(container, 8)
  const id = ELE3_DEVICES['analog-rytm-mkii'].sysexId, framing = Uint8Array.from([0xf0, 0, 0x20, 0x3c, id, 0, 0x7d, 0, 0x10, 1, 2, 3, 0, 0, 0, 0xf7])
  return encodeSyx(stream, id, framing, framing)
}
const put32 = v => [0, 1, 2, 3, 4].map(i => v >>> 7 * i & 0x7f)
const get32 = (p, at) => (p[at] | p[at + 1] << 7 | p[at + 2] << 14 | p[at + 3] << 21 | (p[at + 4] & 0x0f) << 28) >>> 0
const pack7 = data => { const out = []; for (let i = 0; i < data.length; i += 7) { const c = data.subarray(i, i + 7); out.push(c.reduce((t, b, k) => t | (b & 0x80 ? 0x40 >> k : 0), 0), ...Array.from(c, b => b & 0x7f)) } return out }
const ascii = text => Array.from(text, c => c.charCodeAt(0))
// diag.h's log, big-endian: START and BASE, one load record (a made-up log, no unit's).
function logBytes() {
  const bytes = new Uint8Array(6148), v = new DataView(bytes.buffer)
  ;[0x4d574447, 2, 0xabcd, 1, 3, 1, 2].forEach((x, i) => v.setUint32(4 * i, x))
  const load = 40 + 92, incident = load + 32 * 96
  ;[3, 1, 5].forEach((x, i) => v.setUint32(load + 4 * i, x)); ;[623, 765, 0, 0, 0, 0, 600, 10, 742, 371].forEach((x, i) => v.setUint16(load + 12 + 2 * i, x))
  ;[[1, 1, 0], [2, 7, 0x91b73d51]].forEach(([seq, kind, a], n) => { const at = incident + 92 * n; v.setUint32(at, seq); v.setUint32(at + 4, 1); v.setUint32(at + 12, a); v.setUint16(at + 16, kind) })
  return bytes
}
// A Rytm with a Modwerk base (link.c): ident in the Rytm's layout, eleven numbers, label and OS build, then the RAM
// boot's status, SRAM CRC, image CRC, the diagnostics' place (0 in a release base) and the set identity; load (0x23),
// diag (0x22) and log (0x24) as every base answers them, or status 2 (bad request) from an older base without them.
// bumps: the log's seq moves by one before each of the first `bumps` closing looks at it, as a record written during the read.
// loader: the base's own transport, controller and runtime loader compiled for the computer (hostLoader below):
// up_part (0x31) and up_run (0x32) go to it, mods (0x33) answers an empty pool; without it, a base before the loader.
function fakeRytm({ set = null, release = true, load = null, log = null, name = 'Elektron Analog Rytm MKII', bumps = 0, loader = null } = {}) {
  const input = { id: 'i', name, state: 'connected', onmidimessage: null }, requests = {}
  const head = [1, release ? 0 : 1, 0, 0, 0, 0, 0, 3, 228, 32, 0], tail = release ? [0, 0, 0, 0] : [1, 0x6e29194e, 0x5ae21e42, 0x47feffbc]
  const ident = [...head.flatMap(put32), ...ascii('FXCJ'), ...ascii('0176'), ...(set ? [...tail, set.crc, set.bytes] : tail.slice(0, 3)).flatMap(put32)]
  const answer = (data, status, reply) => input.onmidimessage?.({ data: Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, data[6], data[7] | 0x40, status, ...reply, 0xf7]) })
  const output = { id: 'o', name, state: 'connected', send(data) {
    const body = data.slice(8, -1)
    requests[data[7]] = (requests[data[7]] ?? 0) + 1
    if (data[7] >= 0x31 && data[7] <= 0x33 && loader) {
      const line = data[7] === 0x31 ? 'P ' + get32(body, 0) + ' ' + Buffer.from(Uint8Array.from(body).subarray(5)).toString('hex') : data[7] === 0x32 ? 'R ' + get32(body, 0) : null
      if (!line) { queueMicrotask(() => answer(data, 0, pack7(Uint8Array.from([0, 0, 0xfe, 0x60, 0, 0, 0xfe, 0x60, 0, 0, 0, 0, 0, 0, 0, 0, 0x4d, 0x57, 0x49, 0])))); return }
      loader.ask(line).then(out => answer(data, data[7] === 0x31 ? (Number(out) ? 0 : 4) : out ? 0 : 4, data[7] === 0x31 || !out ? [] : pack7(Uint8Array.from(Buffer.from(out, 'hex')))))
      return
    }
    const [status, reply] = data[7] === 0x01 ? [0, ident]
      : data[7] === 0x23 ? (load ? [0, load.flatMap(put32)] : [2, []])
      : data[7] === 0x22 ? (log ? [0, [0x47b5ae1c, log.length].flatMap(put32)] : [2, []])
      : data[7] === 0x24 ? (!log ? [2, []] : (() => {
        const at = get32(body, 0), n = get32(body, 5)
        if (at + n > log.length) return [4, []]
        // the read's closing look at seq (16, 4 bytes): a record was written since the pass began
        if (at === 16 && n === 4 && bumps > 0) { bumps--; new DataView(log.buffer).setUint32(16, new DataView(log.buffer).getUint32(16) + 1) }
        return [0, [...put32(at), ...put32(n), ...pack7(log.subarray(at, at + n))]]
      })())
      : [2, []]                         // a release base: every other request is a bad request
    queueMicrotask(() => answer(data, status, reply))
  } }
  return { input, output, inputs: new Map([['i', input]]), outputs: new Map([['o', output]]), requests, onstatechange: null, close() {} }
}
// A Model:Cycles beside it: answers ident only (fifteen numbers, an older base without the set identity).
function withCycles(rytm) {
  const input = { id: 'mi', name: 'Elektron Model:Cycles', state: 'connected', onmidimessage: null }
  const output = { id: 'mo', name: 'Elektron Model:Cycles', state: 'connected', send(data) {
    const reply = data[7] === 0x01 ? [1, 1, 0, 9, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].flatMap(put32) : []
    queueMicrotask(() => input.onmidimessage?.({ data: Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, data[6], data[7] | 0x40, data[7] === 0x01 ? 0 : 2, ...reply, 0xf7]) }))
  } }
  rytm.inputs.set('mi', input); rytm.outputs.set('mo', output)
  return rytm
}

describe('the developer MCP’s Analog Rytm MKII over its link', () => {
  let frontend, folder, images, service
  beforeAll(async () => {
    const bundled = await build({ root, configFile: false, logLevel: 'silent', define: {
      'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'), 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
    }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false, minify: false, sourcemap: false } })
    frontend = await import('data:text/javascript;base64,' + Buffer.from(bundled.output.find(entry => entry.type === 'chunk' && entry.isEntry).code).toString('base64'))
  }, 60000)
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-rytm-test-')); images = await mkdtemp(join(tmpdir(), 'modwerk-rytm-images-'))
    await writeFile(join(images, 'a-other.syx'), syx(3)); await writeFile(join(images, 'b-built.syx'), syx(7, '{"device": "analog-rytm-mk2"}\n'))
  })
  afterEach(async () => { await service?.close(); service = undefined; await rm(folder, { recursive: true, force: true }); await rm(images, { recursive: true, force: true }) })
  const open = (access, options = {}) => createFrontendTools({ dataDir: folder, elektronMidi: true, elektronImages: images, ...options }, frontend, { elektronAccess: async () => access, now: () => 0 })

  it('takes the set identity from before the storage lockfile, as the linker places the .run block', () => {
    const plain = syx(7), locked = syx(7, '{"x": 1}\n')
    expect(frontend.rytmSetIdentity(locked, 64)).toEqual(frontend.rytmSetIdentity(plain, 64))
    expect(frontend.rytmSetIdentity(locked, 64).crc).not.toBe(frontend.rytmSetIdentity(syx(3), 64).crc)
    expect(() => frontend.rytmSetIdentity(plain, 1 << 20)).toThrow(/larger than the image/)
  })
  it('reads a release base’s identity and names the image whose set the unit runs', async () => {
    const set = frontend.rytmSetIdentity(syx(7, '{"device": "analog-rytm-mk2"}\n'), 64)
    service = await open(fakeRytm({ set }))
    const status = await service.call('device_status')
    expect(status).toMatchObject({ machine: 'analog-rytm-mkii', loader: 'unsupported', inventory: null,
      state: { status: 'ready', identity: { label: 'FXCJ', osBuild: '0176', release: true, armed: false, set, ramBoot: { status: 'none', imageCrc: 0 } } } })
    expect(status.build).toMatchObject({ file: 'b-built.syx' })
  })
  it('reads a development base’s RAM boot, and an older base without the set identity', async () => {
    service = await open(fakeRytm({ set: { crc: 1, bytes: 64 }, release: false }))
    expect((await service.call('device_status')).state.identity).toMatchObject({ release: false, armed: true, ramBoot: { status: 'booted from RAM', imageCrc: 0x5ae21e42 } })
    expect((await service.call('device_status')).build).toBeNull()
    await service.close(); service = await open(fakeRytm({ release: false }))
    expect(await service.call('device_status')).toMatchObject({ build: null, state: { identity: { set: null, release: false } } })
  })
  it('reads the audio load and the log, and reports an older base without them as unsupported', async () => {
    service = await open(fakeRytm({ load: [623, 765, 765, 600, 450000], log: logBytes() }))
    expect(await service.call('device_load')).toEqual({ machine: 'analog-rytm-mkii', supported: true,
      reading: { windowPercent: 62.3, windowPeakPercent: 76.5, peakPercent: 76.5, windows: 600, blocks: 450000 } })
    const { machine, supported, log } = await service.call('device_log')
    expect({ machine, supported, seq: log.seq }).toEqual({ machine: 'analog-rytm-mkii', supported: true, seq: 3 })
    expect(log.loads).toEqual([{ seq: 3, boot: 1, minute: 5, cpu: [623, 765], dsp1to4: [0, 0], dsp5to8: [0, 0], samples: 600, playing: 10, frameGap: 742, tickGap: 371 }])
    expect(log.incidents.map(i => [i.kind, i.a])).toEqual([['start', 0], ['base', 0x91b73d51]])
    expect(log).not.toHaveProperty('nonce')
    await service.close(); service = await open(fakeRytm())
    expect(await service.call('device_load')).toEqual({ machine: 'analog-rytm-mkii', supported: false, reading: null })
    expect(await service.call('device_log')).toEqual({ machine: 'analog-rytm-mkii', supported: false, log: null })
  })
  it('reports a base without the loader, and what a missing unit needs', async () => {
    await writeFile(join(images, 'x.mwrm'), Uint8Array.from([...ascii('MWRM'), ...new Array(60).fill(0)]))
    service = await open(fakeRytm({ set: { crc: 1, bytes: 64 } }), { allowDeviceWrites: true })
    expect((await service.call('device_status')).loader).toBe('unsupported')
    await expect(service.call('device_review', { moduleIds: ['x.mwrm'] })).rejects.toThrow(/hello was not confirmed/)   // the upload session's word for a base that refuses up_part
    await service.close(); service = await open(fakeRytm({ name: 'IAC Driver Bus 1' }))
    await expect(service.call('device_status')).rejects.toThrow(/nor an Analog Rytm MKII/)
    await service.close(); service = await open(fakeRytm({ name: 'Elektron Analog Rytm' }))   // an MKI is not this link's
    await expect(service.call('device_status')).rejects.toThrow(/nor an Analog Rytm MKII/)
  })
  it('reads the log again while the unit writes a record during the read, and gives up after three passes', async () => {
    const access = fakeRytm({ log: logBytes(), bumps: 2 })
    service = await open(access)
    expect((await service.call('device_log')).log.seq).toBe(5)
    expect(access.requests[0x24]).toBe(3 * (Math.ceil(6148 / 128) + 1))
    await service.close(); service = await open(fakeRytm({ log: logBytes(), bumps: 3 }))
    await expect(service.call('device_log')).rejects.toThrow(/kept changing/)
  })
  // The base's loader on the host, one request a line (the Model:Cycles' harness, test_modules.c, over the Rytm's
  // modules.c and runtime.c), and a runtime package for it: ABI 4, a tick hook that returns at once.
  const cc = spawnSync('cc', ['--version']).status === 0
  function hostLoader() {
    const base = join(root, 'sdk/machines/analog-rytm-mkii/elekloader/base'), rt = join(root, 'sdk/runtime')
    const exe = join(folder, 'loader')
    const built = spawnSync('cc', ['-std=c99', '-DMODWERK_HOST', '-DRUNTIME_MODULES=16u', '-DRUNTIME_POOL_BYTES=65536u', '-I', join(rt, 'loader'), '-I', join(rt, 'upload'),
      join(root, 'sdk/machines/model-cycles/elekloader/base/test_modules.c'), join(base, 'modules.c'), join(base, 'runtime.c'), join(rt, 'loader/loader.c'),
      join(rt, 'upload/upload.c'), join(rt, 'upload/wire.c'), join(rt, 'upload/sha256.c'), '-o', exe])
    expect(built.status, String(built.stderr)).toBe(0)
    const child = spawn(exe), lines = createInterface({ input: child.stdout }), waiting = []
    lines.on('line', line => waiting.shift()?.(line))
    let chain = Promise.resolve()
    const loader = { ask: line => (chain = chain.then(() => new Promise(resolve => { waiting.push(resolve); child.stdin.write(line + '\n') }))) }
    const pkg = Buffer.concat([Buffer.from('MWRM'), Buffer.from([0, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0x59, 0x4c, 0xfd, 0x26]),
      Buffer.alloc(4), Buffer.from([0x4e, 0x75, 0x4e, 0x71])])
    return { child, loader, pkg }
  }
  it.skipIf(!cc)('reviews a package, puts it on trial, undoes it and keeps it, through the base\'s own loader', async () => {
    const { child, loader, pkg } = hostLoader()
    try {
      await writeFile(join(images, 'hello.mwrm'), pkg)
      service = await open(fakeRytm({ set: { crc: 0x12345678, bytes: 64 }, loader }), { allowDeviceWrites: true })
      expect((await service.call('device_status')).loader).toMatchObject({ free: 65120, active: 0, modules: [] })
      const review = await service.call('device_review', { moduleIds: ['hello.mwrm'] })
      expect(review).toMatchObject({ machine: 'analog-rytm-mkii', changes: [{ module: 'hello.mwrm', bytes: pkg.length, undoAvailable: true }] })
      expect(review.base).toBe(frontend.mcUploadBase(0x12345678))
      const trial = await service.call('device_trial', { review: review.review })
      expect(trial).toMatchObject({ machine: 'analog-rytm-mkii', state: { phase: 'trial' } })
      const undone = await service.call('device_undo', { trial: trial.trial })
      expect(undone).toMatchObject({ machine: 'analog-rytm-mkii', kept: false, completed: true, phase: 'normal', active: review.active })
      const again = await service.call('device_trial', { review: (await service.call('device_review', { moduleIds: ['hello.mwrm'] })).review })
      const kept = await service.call('device_keep', { trial: again.trial })
      expect(kept).toMatchObject({ kept: true, completed: true, phase: 'normal' })
      expect(kept.active).not.toBe(review.active)
    } finally { child.stdin.end() }
  }, 30000)
  it('asks a Model:Cycles first when both are connected', async () => {
    service = await open(withCycles(fakeRytm({ set: { crc: 1, bytes: 64 } })))
    expect((await service.call('device_status')).machine).toBe('model-cycles')
  })
})
