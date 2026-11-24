import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
// A unit with a development base: answers ident with the given set identity, and load with the given tenths of a
// percent and counts (link.c CMD_LOAD) or, without them, as a base before the load probe (status 2, bad request).
function fakeCycles(set, name = 'Elektron Model:Cycles', load = null) {
  const input = { id: 'i', name, state: 'connected', onmidimessage: null }
  const fields = [1, 1, 0, 146, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, ...(set ? [set.crc, set.bytes] : [])]
  const output = { id: 'o', name, state: 'connected', send(data) {
    const [status, body] = data[7] === 0x22 ? (load ? [0, load] : [2, []]) : [0, fields]
    queueMicrotask(() => input.onmidimessage?.({ data: Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, data[6], data[7] | 0x40, status, ...body.flatMap(put32), 0xf7]) }))
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
  it('offers no log or trial yet', async () => {
    service = await open(fakeCycles(null), { allowDeviceWrites: true })
    expect(await service.call('device_log')).toEqual({ supported: false, log: null })
    await expect(service.call('device_review', { moduleIds: [] })).rejects.toThrow(/no runtime loader/)
  })
})
