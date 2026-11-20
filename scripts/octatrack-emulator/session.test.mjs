import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { emulatorArgs, sessionEnv, sessionSockets } from './session.mjs'
import { context } from '../test-procedure.mjs'

it('starts ot_emu on its line protocol, so pace on can tie emulated time to the wall clock', () => {
  expect(emulatorArgs({ image: '/i/MAIN.raw', bench: '/s/bench.sock' })).toEqual(['--interactive', '--image', '/i/MAIN.raw', '--usb-host', '/s/bench.sock', '--max', '400000000000', '--mkii'])
  // The DSPs need the real-time cores (which need the line protocol) and the frame interrupt.
  expect(emulatorArgs({ image: 'M', bench: 'B', dsp: true }).slice(-3)).toEqual(['--dsp', '--dsp-rt', '--frame'])
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
