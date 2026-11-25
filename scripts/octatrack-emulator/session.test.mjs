import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { emulatorArgs, sessionEnv, sessionSockets, startSession } from './session.mjs'
import { context } from '../test-procedure.mjs'

it('starts ot_emu on its line protocol, so pace on can tie emulated time to the wall clock', () => {
  expect(emulatorArgs({ image: '/i/MAIN.raw', bench: '/s/bench.sock' })).toEqual(['--interactive', '--image', '/i/MAIN.raw', '--usb-host', '/s/bench.sock', '--max', '400000000000', '--mkii'])
  // The DSPs need the real-time cores (which need the line protocol) and the frame interrupt.
  expect(emulatorArgs({ image: 'M', bench: 'B', dsp: true }).slice(-3)).toEqual(['--dsp', '--dsp-rt', '--frame'])
  // --mki: the port boots as an MKI when it is not told it is an MKII (its Part gestures differ, #2099).
  expect(emulatorArgs({ image: 'M', bench: 'B', mki: true })).not.toContain('--mkii')
})

it('hands the command its session: the emulator target, the shared bench and the line socket', () => {
  const sockets = sessionSockets('/tmp/mw')
  expect(sockets).toEqual({ bench: '/tmp/mw/bench.sock', dev: '/tmp/mw/dev.sock', share: '/tmp/mw/share.sock' })
  const env = sessionEnv(sockets)
  expect(env).toEqual({ MODWERK_UNIT: 'emulator', MODWERK_SHARE_SOCKET: '/tmp/mw/share.sock', MODWERK_DEV_SOCKET: '/tmp/mw/dev.sock' })
  // test:procedure inside the session runs its unit steps there, labelled emulator, without being told.
  const ctx = context(join(import.meta.dirname, '../..'), { out: mkdtempSync(join(tmpdir(), 'procedure-')) }, ['vibrato'], env)
  expect(ctx).toMatchObject({ target: 'emulator', share: '/tmp/mw/share.sock', devSocket: '/tmp/mw/dev.sock', env: { MODWERK_UNIT: 'emulator', MODWERK_DEV_SOCKET: '/tmp/mw/dev.sock' } })
  // Outside a session nothing changes: the unit, its default sockets.
  expect(context(join(import.meta.dirname, '../..'), { out: mkdtempSync(join(tmpdir(), 'procedure-')) }, ['vibrato'], {})).toMatchObject({ target: 'unit', share: '/tmp/modwerk-share.sock', env: {} })
})

/** A child process that does what it is told: prints, exits, or waits to be killed. */
function fakeChild() {
  const child = new EventEmitter()
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), exitCode: null, signalCode: null, killed: [] })
  child.kill = signal => { child.killed.push(signal); child.signalCode = signal; queueMicrotask(() => child.emit('exit', null, signal)) }
  return child
}

describe('startSession', () => {
  it('boots ot_emu with pace on, starts the shared session once the bench is up, and ends both on stop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mw-')), files = new Set(), spawned = []
    const spawn = (command, args, options) => {
      const child = fakeChild()
      spawned.push({ command, args, options, child })
      if (spawned.length === 1) setTimeout(() => { child.stdout.write('ready 1\n'); files.add(join(dir, 'bench.sock')) }, 10)
      else setTimeout(() => { files.add(join(dir, 'share.sock')); files.add(join(dir, 'dev.sock')) }, 10)
      return child
    }
    const session = await startSession({ emulator: '/e/ot_emu', image: '/t/MAIN.raw', dsp: true, dir, settle: 0, spawn, exists: path => files.has(path), log: () => {} })
    expect(spawned[0].command).toBe('/e/ot_emu')
    expect(spawned[0].args).toEqual(emulatorArgs({ image: '/t/MAIN.raw', bench: join(dir, 'bench.sock'), dsp: true }))
    expect(spawned[0].child.stdin.read().toString()).toBe('pace on\n')
    expect(spawned[1].args).toEqual(['scripts/device.mjs', 'serve', '--emulator', '--socket', join(dir, 'bench.sock'), '--share', join(dir, 'share.sock')])
    expect(spawned[1].options.env).toMatchObject(sessionEnv(sessionSockets(dir)))
    expect(session.env).toEqual(sessionEnv(sessionSockets(dir)))
    await session.stop()
    expect(spawned.map(s => s.child.killed)).toEqual([['SIGTERM'], ['SIGTERM']])
  })

  it('says why when ot_emu ends before it is ready, and starts no session', async () => {
    const spawned = [], logged = []
    const spawn = () => {
      const child = fakeChild()
      spawned.push(child)
      setTimeout(() => { child.stderr.write('cannot read image\n'); child.exitCode = 1; child.emit('exit', 1, null) }, 10)
      return child
    }
    await expect(startSession({ emulator: '/e/ot_emu', image: '/t/MAIN.raw', dir: mkdtempSync(join(tmpdir(), 'mw-')), settle: 0, spawn, exists: () => false, log: text => logged.push(text) }))
      .rejects.toThrow('ot_emu ended before the session was ready (exit 1)')
    expect(spawned).toHaveLength(1)
    expect(logged.join('')).toContain('cannot read image')
  })
})
