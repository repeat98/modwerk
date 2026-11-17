import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { fakeEffect, fakeEffectList, fakeZoomPedal } from '../src/dev/zoom-pedal-fake'
import { ZoomLink } from '../src/engine/zoom/zoom-link'
import { listRecords } from '../src/engine/zoom/zoom-protocol'
import { createFrontendTools } from './frontend-mcp.mjs'
import { nodeMidiAccess, zoomCommand } from './zoom-device.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const PORTS = ['Netzwerk Network Session 1', 'ZOOM MS Series']
// @julusian/midi's shape over the fake pedal. As RtMidi, it drops SysEx until ignoreTypes(false, …), and here every
// message from the pedal arrives split over two events.
function fakeNative(pedal) {
  const calls = []
  class Input extends EventEmitter {
    static getPortNames() { return PORTS }
    sysex = false
    ignoreTypes(sysex) { this.sysex = !sysex }
    openPort(index) {
      calls.push(['openIn', index])
      pedal.input.onmidimessage = ({ data }) => { if (!this.sysex) return; const cut = data.length >> 1; this.emit('message', 0, [...data.slice(0, cut)]); this.emit('message', 0, [...data.slice(cut)]) }
    }
    closePort() { calls.push(['closeIn']) }
  }
  class Output {
    static getPortNames() { return PORTS }
    openPort(index) { calls.push(['openOut', index]) }
    sendMessage(data) { calls.push(['send', performance.now(), data[1]]); pedal.output.send(data) }
    closePort() { calls.push(['closeOut']) }
  }
  return { Input, Output, calls }
}
const effects = () => [fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] })]
const connected = async pedal => { const link = new ZoomLink(async () => pedal.access, 200); await link.connect(); return link }
const writes = pedal => pedal.sent.filter(m => m[1] === 0x52 && m[4] === 0x60 && (m[5] === 0x23 || m[5] === 0x24 || (m[5] === 0x20 && m[6] === 0x01)))

describe('Web MIDI over RtMidi for ZoomLink', () => {
  it('opens only the pedal’s ports with SysEx on, and ZoomLink reads it through them, replies split over events', async () => {
    const pedal = fakeZoomPedal({ files: [fakeEffect('LOOP.ZDL', 8, 480, '0.03', 3000)] }), native = fakeNative(pedal)
    const access = await nodeMidiAccess(native), link = new ZoomLink(async () => access, 200)
    expect([...access.inputs.values()].map(port => port.name)).toEqual(PORTS)
    await link.connect()
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { model: 'MS-70CDR', firmware: '2.10' } })
    expect((await link.listFiles({ versions: true }))[0]).toMatchObject({ name: 'LOOP.ZDL', size: 3000, effect: { gid: 8, fxid: 480, version: '0.03' } })
    expect(native.calls.filter(([what]) => what.startsWith('open'))).toEqual([['openIn', 1], ['openOut', 1]])
    access.close()
    expect(native.calls.filter(([what]) => what.startsWith('close'))).toEqual([['closeIn'], ['closeOut']])
  })
  it('sends each message at its timestamp, in order, as Web MIDI does', async () => {
    const native = fakeNative(fakeZoomPedal()), out = (await nodeMidiAccess(native)).outputs.get('out-1'), start = performance.now()
    out.send([0xf0, 1, 0xf7], start + 40); out.send([0xf0, 2, 0xf7]); out.send([0xf0, 3, 0xf7], start + 60)
    await new Promise(resolve => setTimeout(resolve, 100))
    const sent = native.calls.filter(([what]) => what === 'send')
    expect(sent.map(([, , id]) => id)).toEqual([1, 2, 3])
    expect(sent[0][1]).toBeGreaterThanOrEqual(start + 39)
    expect(sent[2][1]).toBeGreaterThanOrEqual(start + 59)
  })
})

describe('the Zoom commands (CLI and MCP)', () => {
  let dir
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'modwerk-zoom-test-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('reads identity, files and a backup, and writes nothing to the pedal', async () => {
    const pedal = fakeZoomPedal({ files: effects(), free: 123_456 }), link = await connected(pedal)
    expect(await zoomCommand(link, 'status', undefined, { dir })).toEqual({ deviceId: 0x61, model: 'MS-70CDR', firmware: '2.10' })
    const { files, free } = await zoomCommand(link, 'list', undefined, { dir })
    expect(files.map(f => [f.name, f.effect?.fxid])).toEqual([['DELAY.ZDL', undefined], ['LOOP.ZDL', 480], ['FLST_SEQ.ZDT', undefined]])   // headers only where added effects live (group 8)
    expect(free).toBe(123_456)
    const backup = await zoomCommand(link, 'backup', 'pedal.zip', { dir })
    expect(backup).toMatchObject({ files: 3, path: join(dir, 'pedal.zip'), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect([...(await readFile(backup.path)).subarray(0, 4)]).toEqual([0x50, 0x4b, 3, 4])
    expect((await stat(backup.path)).mode & 0o777).toBe(0o600)
    await expect(zoomCommand(link, 'backup', 'pedal.zip', { dir })).rejects.toThrow(/EEXIST/)   // never over an older backup
    expect(writes(pedal)).toEqual([])
  })
  it('installs and removes only when confirmed, keeping the effect list from before', async () => {
    const pedal = fakeZoomPedal({ files: effects() }), link = await connected(pedal), file = join(dir, 'nam1smok.zdl')
    await writeFile(file, Uint8Array.from(fakeEffect('X', 8, 900, '0.26', 2000).data))
    await expect(zoomCommand(link, 'install', file, { dir })).rejects.toThrow(/confirm/)
    await expect(zoomCommand(link, 'remove', 'LOOP.ZDL', { dir })).rejects.toThrow(/confirm/)
    expect(writes(pedal)).toEqual([])
    const installed = await zoomCommand(link, 'install', file, { dir, confirmed: true })
    expect(installed).toMatchObject({ installed: 'NAM1SMOK.ZDL', unchanged: false })
    expect(listRecords([...await readFile(installed.previousList)]).map(r => r.name)).toEqual(['DELAY.ZDL', 'LOOP.ZDL'])
    expect(pedal.files.map(f => f.name)).toContain('NAM1SMOK.ZDL')
    const removed = await zoomCommand(link, 'remove', 'nam1smok.zdl', { dir, confirmed: true })
    expect(removed.removed).toBe('NAM1SMOK.ZDL')
    expect(pedal.files.map(f => f.name)).not.toContain('NAM1SMOK.ZDL')
    await expect(zoomCommand(link, 'remove', 'DELAY.ZDL', { dir, confirmed: true })).rejects.toThrow(/only added effects/)
  })
  it('uses no files in update mode, and says when no pedal answered', async () => {
    const updating = await connected(fakeZoomPedal({ firmware: '1.10' }))
    expect(await zoomCommand(updating, 'status', undefined, { dir })).toMatchObject({ firmware: '1.10' })
    await expect(zoomCommand(updating, 'list', undefined, { dir })).rejects.toThrow(/update mode/)
    await expect(zoomCommand(await connected(fakeZoomPedal({ portName: 'IAC Driver Bus 1' })), 'status', undefined, { dir })).rejects.toThrow(/No Zoom pedal/)
  })
})

describe('the developer MCP’s Zoom tools', () => {
  let frontend, folder, effectsDir, service, pedal
  beforeAll(async () => {
    const bundled = await build({ root, configFile: false, logLevel: 'silent', define: {
      'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'), 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
    }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false, minify: false, sourcemap: false } })
    frontend = await import('data:text/javascript;base64,' + Buffer.from(bundled.output.find(entry => entry.type === 'chunk' && entry.isEntry).code).toString('base64'))
  }, 60000)
  const open = options => createFrontendTools({ dataDir: folder, zoomMidi: true, ...options }, frontend, { zoomAccess: async () => pedal.access })
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-zoom-test-')); effectsDir = await mkdtemp(join(tmpdir(), 'modwerk-zoom-effects-'))
    pedal = fakeZoomPedal({ files: effects() })
    await writeFile(join(effectsDir, 'RINGT.ZDL'), Uint8Array.from(fakeEffect('X', 8, 901, '0.01').data))
  })
  afterEach(async () => { await service?.close(); service = undefined; await rm(folder, { recursive: true, force: true }); await rm(effectsDir, { recursive: true, force: true }) })

  it('reads through the site’s ZoomLink and backs up into the private workspace', async () => {
    service = await open()
    expect(await service.call('zoom_status')).toMatchObject({ model: 'MS-70CDR', firmware: '2.10' })
    expect((await service.call('zoom_list')).files).toHaveLength(3)
    const backup = await service.call('zoom_backup')
    expect(backup.files).toBe(3)
    expect(backup.path.startsWith(folder)).toBe(true)
    expect(service.tools.find(tool => tool.name === 'zoom_list').annotations.readOnlyHint).toBe(true)
    expect(writes(pedal)).toEqual([])
  })
  it('starts again after the pedal went away, as these ports don’t say', async () => {
    service = await open()
    await service.call('zoom_status')
    pedal.output.send = () => {}   // unplugged: the link still says ready
    await expect(service.call('zoom_list')).rejects.toThrow(/stopped answering/)
    pedal = fakeZoomPedal({ files: effects() })   // plugged in again
    expect((await service.call('zoom_list')).files).toHaveLength(3)
  }, 15000)
  it('refuses Zoom tools without --zoom-midi, and writes without --allow-device-writes, confirm=true and a plain effect name', async () => {
    service = await open({ zoomMidi: false })
    await expect(service.call('zoom_status')).rejects.toThrow('--zoom-midi')
    await service.close(); service = await open({ zoomEffects: effectsDir })
    await expect(service.call('zoom_install', { file: 'RINGT.ZDL', confirm: true })).rejects.toThrow('--allow-device-writes')
    await service.close(); service = await open({ zoomEffects: effectsDir, allowDeviceWrites: true })
    await expect(service.call('zoom_install', { file: 'RINGT.ZDL', confirm: false })).rejects.toThrow('confirm=true')
    for (const file of ['../RINGT.ZDL', '/etc/RINGT.ZDL', 'LONGNAME9.ZDL', 'RINGT.ZDT']) await expect(service.call('zoom_install', { file, confirm: true })).rejects.toThrow('effect file')
    expect(writes(pedal)).toEqual([])
    expect(await service.call('zoom_install', { file: 'RINGT.ZDL', confirm: true })).toMatchObject({ installed: 'RINGT.ZDL', unchanged: false })
    expect(await service.call('zoom_remove', { file: 'RINGT.ZDL', confirm: true })).toMatchObject({ removed: 'RINGT.ZDL' })
    expect(pedal.files.map(f => f.name)).toEqual(['DELAY.ZDL', 'LOOP.ZDL', 'FLST_SEQ.ZDT'])
  })
})
