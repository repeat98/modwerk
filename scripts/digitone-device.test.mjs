import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { LINK_HEADER, get32, pack7, u32, unpack7, UPLOAD_BASE } from '../src/engine/elektron/dn2-link'
import { UploadCommand, UploadPhase, UploadResult } from '../src/engine/elekloader/upload-wire'
import { createFrontendTools } from './frontend-mcp.mjs'
import { DigitoneUnit, midiLinkLine } from './digitone-device.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const be = value => [value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff]
const LOG_AT = 0x47f0315c, LOG_SIZE = 6148

/** A Digitone II with a development base, in Web MIDI's shape: link.c's ident, diag and mem, and its upload command
 * into a controller as far as a trial, Keep and Undo reach (sdk/runtime/upload/upload.c). Every reply arrives split
 * over two events, as RtMidi hands long SysEx over. */
function fakeDigitone({ playing = false } = {}) {
  const names = Object.fromEntries(Object.entries(UploadCommand).map(([name, code]) => [code, name]))
  const before = UPLOAD_BASE
  const state = { phase: 'normal', last: 0, current: 0, received: 0, generation: 0, active: before, staged: '', previous: before, frames: [] }
  const memory = new Map()
  ;[...be(0x4d574447), ...be(2), ...be(0x1234), ...be(1), ...be(0), ...be(0), ...be(1)].forEach((b, i) => memory.set(LOG_AT + i, b))
  const base = LOG_AT + 40 + 92 + 32 * 96
  ;[...be(1), ...be(1), ...be(0), ...be(0), 0, 1].forEach((b, i) => memory.set(base + i, b))
  for (let i = 0; i < 16; i++) memory.set(base + 64 + i, 0xff)
  const respond = (command, transaction, result = 'ok') => {
    const out = new Uint8Array(144), view = new DataView(out.buffer)
    view.setUint32(0, 0x4d575552); view.setUint16(4, 1); view.setUint16(6, command); view.setUint32(8, transaction); view.setUint32(12, 128)
    ;[UploadResult.indexOf(result), UploadPhase.indexOf(state.phase), 1, state.generation, state.last, state.current, state.received, 262144]
      .forEach((value, i) => view.setUint32(16 + 4 * i, value))
    out.set(Buffer.from(UPLOAD_BASE, 'hex'), 48); out.set(new Uint8Array(32).fill(0x53), 80); out.set(Buffer.from(state.active, 'hex'), 112)
    return out
  }
  const controller = frame => {
    const view = new DataView(frame.buffer, frame.byteOffset), command = view.getUint16(6), transaction = view.getUint32(8), name = names[command]
    state.frames.push(name)
    switch (name) {
      case 'enter': if (playing) return respond(command, transaction, 'unsafe'); state.phase = state.phase === 'trial' ? 'pending' : 'ready'; break
      case 'leave': state.phase = state.phase === 'pending' ? 'trial' : 'normal'; break
      case 'begin': state.last = state.current = transaction; state.phase = 'receiving'; state.received = 0
        state.staged = Buffer.from(frame.subarray(80, 112)).toString('hex'); break
      case 'chunk': state.received += frame.length - 52; break
      case 'verify': state.phase = 'verified'; break
      case 'commit': state.previous = state.active; state.phase = 'pending'; state.active = state.staged; state.generation++; break
      case 'accept': state.phase = 'ready'; break
      case 'rollback': state.phase = 'ready'; state.active = state.previous; state.generation++; break
    }
    return respond(command, transaction)
  }
  let listener = null
  const reply = (seq, cmd, status, payload = []) => {
    const message = [...LINK_HEADER, seq, cmd | 0x40, status, ...payload, 0xf7], cut = message.length >> 1
    queueMicrotask(() => { listener?.({ data: Uint8Array.from(message.slice(0, cut)) }); listener?.({ data: Uint8Array.from(message.slice(cut)) }) })
  }
  const unit = data => {
    const seq = data[6], cmd = data[7]
    if (cmd === 0x01) return reply(seq, cmd, 0, [1, 7, 0, 300, 1, 0, 0, 0, 0, 1, 0, LOG_AT, state.phase === 'normal' && state.active === before ? 0 : 1, 0x47f00000].flatMap(u32))
    if (cmd === 0x22) return reply(seq, cmd, 0, [LOG_AT, LOG_SIZE, 1500, 30].flatMap(u32))
    if (cmd === 0x21) {
      const at = get32(data, 8), n = get32(data, 13)
      return reply(seq, cmd, 0, [...u32(at), ...pack7(Uint8Array.from({ length: n }, (_, i) => memory.get(at + i) ?? 0))])
    }
    if (cmd === 0x30) return reply(seq, cmd, 0, pack7(controller(unpack7(data.subarray(8, -1)))))
    reply(seq, cmd, 2)
  }
  const access = {
    inputs: new Map([['in-0', { id: 'in-0', name: 'IAC Driver Bus 1', state: 'connected', onmidimessage: null }],
      ['in-1', { id: 'in-1', name: 'Elektron Digitone II', state: 'connected', get onmidimessage() { return listener }, set onmidimessage(next) { listener = next } }]]),
    outputs: new Map([['out-0', { id: 'out-0', name: 'IAC Driver Bus 1', state: 'connected', send() {} }],
      ['out-1', { id: 'out-1', name: 'Elektron Digitone II', state: 'connected', send: data => unit(Uint8Array.from(data)) }]]),
    onstatechange: null, closed: 0, close() { this.closed++ },
  }
  return { access, state }
}

describe('a Digitone II over the computer’s MIDI', () => {
  it('reads the link and the loader through the site’s client, with replies split over events', async () => {
    const fake = fakeDigitone(), unit = new DigitoneUnit(midiLinkLine(fake.access))
    expect(await unit.status()).toMatchObject({ link: { version: 1, ticks: 300, armed: true, bootStatus: 1 }, loader: { phase: 'normal', active: UPLOAD_BASE }, trialOpen: false })
    expect(await unit.log()).toMatchObject({ version: 2, incidents: [{ kind: 'start' }] })
  })

  it('opens a trial, keeps it open with frames, then keeps or rolls it back', async () => {
    const fake = fakeDigitone(), unit = new DigitoneUnit(midiLinkLine(fake.access), 20), data = new Uint8Array(5000).fill(9)
    const trial = await unit.trial(data)
    expect(trial).toMatchObject({ phase: 'trial', bytes: 5000 })
    expect(fake.state.active).toBe(trial.sha256)
    await expect(unit.trial(data)).rejects.toThrow('keep or undo')
    const frames = fake.state.frames.length
    await new Promise(done => setTimeout(done, 90))
    expect(fake.state.frames.slice(frames).filter(name => name === 'hello').length).toBeGreaterThanOrEqual(2)
    expect(await unit.keep()).toMatchObject({ kept: true, phase: 'normal', active: trial.sha256 })
    const after = fake.state.frames.length
    await new Promise(done => setTimeout(done, 60))
    expect(fake.state.frames.length).toBe(after)            // no keepalive once the trial is settled
    await unit.trial(new Uint8Array(100).fill(1))
    expect(await unit.undo()).toMatchObject({ kept: false, phase: 'normal', active: trial.sha256 })
    await expect(unit.undo()).rejects.toThrow('No trial is open')
  })

  it('refuses a trial while the unit plays, and a port list without one Digitone II', async () => {
    const playing = fakeDigitone({ playing: true })
    await expect(new DigitoneUnit(midiLinkLine(playing.access)).trial(new Uint8Array(10))).rejects.toThrow(/unsafe/)
    expect(() => midiLinkLine({ inputs: new Map(), outputs: new Map(), onstatechange: null })).toThrow('Connect one Digitone II')
  })
})

describe('the developer MCP’s Digitone II tools', () => {
  let frontend, folder, packages, service, fake
  beforeAll(async () => {
    const bundled = await build({ root, configFile: false, logLevel: 'silent', define: {
      'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'), 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
    }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false, minify: false, sourcemap: false } })
    frontend = await import('data:text/javascript;base64,' + Buffer.from(bundled.output.find(entry => entry.type === 'chunk' && entry.isEntry).code).toString('base64'))
  }, 60000)
  const open = options => createFrontendTools({ dataDir: folder, digitoneMidi: true, ...options }, frontend, { digitoneAccess: async () => fake.access })
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-digitone-test-')); packages = await mkdtemp(join(tmpdir(), 'modwerk-digitone-packages-'))
    fake = fakeDigitone()
    await writeFile(join(packages, 'tick_count.mwrm'), new Uint8Array(88).fill(3))
  })
  afterEach(async () => { await service?.close(); service = undefined; await rm(folder, { recursive: true, force: true }); await rm(packages, { recursive: true, force: true }) })

  it('reads read-only, and loads a package only with --allow-device-writes, confirm=true and a plain name', async () => {
    service = await open({ zoomMidi: false })
    expect(await service.call('digitone_status')).toMatchObject({ loader: { phase: 'normal' } })
    expect(await service.call('digitone_log')).toMatchObject({ version: 2 })
    expect(service.tools.find(tool => tool.name === 'digitone_status').annotations.readOnlyHint).toBe(true)
    await expect(service.call('digitone_trial', { file: 'tick_count.mwrm', confirm: true })).rejects.toThrow('--allow-device-writes')
    await service.close(); service = await open({ allowDeviceWrites: true })
    await expect(service.call('digitone_trial', { file: 'tick_count.mwrm', confirm: true })).rejects.toThrow('--digitone-packages')
    await service.close(); service = await open({ allowDeviceWrites: true, digitonePackages: packages })
    await expect(service.call('digitone_trial', { file: 'tick_count.mwrm', confirm: false })).rejects.toThrow('confirm=true')
    for (const file of ['../tick_count.mwrm', '/etc/tick_count.mwrm', 'tick_count.bin']) await expect(service.call('digitone_trial', { file, confirm: true })).rejects.toThrow('runtime package')
    expect(fake.state.frames.filter(name => name === 'begin')).toEqual([])
    expect(await service.call('digitone_trial', { file: 'tick_count.mwrm', confirm: true })).toMatchObject({ phase: 'trial', bytes: 88 })
    await expect(service.call('digitone_keep', { confirm: false })).rejects.toThrow('confirm=true')
    expect(await service.call('digitone_undo')).toMatchObject({ kept: false, phase: 'normal' })
  })

  it('rolls an open trial back when it closes, and refuses without --digitone-midi', async () => {
    service = await open({ allowDeviceWrites: true, digitonePackages: packages })
    await service.call('digitone_trial', { file: 'tick_count.mwrm', confirm: true })
    await service.close(); service = undefined
    expect(fake.state.frames.at(-2)).toBe('rollback')
    expect(fake.access.closed).toBe(1)
    service = await open({ digitoneMidi: false })
    await expect(service.call('digitone_status')).rejects.toThrow('--digitone-midi')
  })
})
