// An Octatrack emulator session that the unit's tools drive like a unit: ot_emu on a development twin, paced to the wall clock
// so every wait in device:test means the same as on the unit, served by `npm run device -- serve --emulator`.
//
//   npm run device:emulator -- --image MAIN.raw [--emulator PATH] [--dsp] [--dir DIR]          # until Ctrl-C
//   npm run device:emulator -- --image MAIN.raw -- npm run test:procedure -- <module id>        # the procedure on it, then stop
//
// --image is a development twin's MAIN.raw (build_core.py --dev; your own OS stays on your computer). --emulator is the adapted
// ot_emu from scripts/octatrack-emulator/build.py (MODWERK_OT_EMU); the plain port refuses a USB trial on a current twin.
// --dsp runs both DSP cores and the frame interrupt, without which device:test lists its frame checks as not run. The command
// after `--` gets the session in its environment (MODWERK_UNIT=emulator, MODWERK_SHARE_SOCKET, MODWERK_DEV_SOCKET), so
// test:procedure runs its unit steps on the emulator and labels them so. Emulator results never count as hardware evidence.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')

/** ot_emu's arguments: the line protocol on stdin (so `pace on` can tie emulated time to the wall clock), the USB bench. */
export function emulatorArgs({ image, bench, dsp = false }) {
  return ['--interactive', '--image', image, '--usb-host', bench, '--max', '400000000000', '--mkii', ...(dsp ? ['--dsp', '--dsp-rt', '--frame'] : [])]
}

/** The sockets of a session in DIR, and the environment the unit's tools need to use it. */
export function sessionSockets(dir) {
  // A Unix socket path is limited to about 104 characters on macOS: keep DIR short.
  return { bench: join(dir, 'bench.sock'), dev: join(dir, 'dev.sock'), share: join(dir, 'share.sock') }
}
export const sessionEnv = sockets => ({ MODWERK_UNIT: 'emulator', MODWERK_SHARE_SOCKET: sockets.share, MODWERK_DEV_SOCKET: sockets.dev })

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, ms, what) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(250)) if (test()) return
  throw new Error('timed out waiting for ' + what)
}

async function main() {
  const split = process.argv.indexOf('--')
  const own = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split), command = split < 0 ? [] : process.argv.slice(split + 1)
  const { values } = parseArgs({ args: own, options: { image: { type: 'string' }, emulator: { type: 'string' }, dsp: { type: 'boolean' },
    dir: { type: 'string' }, settle: { type: 'string', default: '20' } } })
  const emulator = values.emulator ?? process.env.MODWERK_OT_EMU
  if (!values.image || !emulator) {
    console.error('Usage: npm run device:emulator -- --image MAIN.raw --emulator OT_EMU [--dsp] [--dir DIR] [--settle 20] [-- COMMAND…]\n' +
      '(MODWERK_OT_EMU names the adapted ot_emu from scripts/octatrack-emulator/build.py; docs/TEST_PROCEDURE.md, "One set of cases, two targets")')
    process.exit(2)
  }
  const dir = resolve(values.dir ?? join(tmpdir(), 'mw-emu-' + process.pid))
  mkdirSync(dir, { recursive: true })
  const sockets = sessionSockets(dir)
  for (const path of Object.values(sockets)) rmSync(path, { force: true })
  const children = []
  const stop = code => { for (const child of children.reverse()) child.kill('SIGTERM'); for (const path of Object.values(sockets)) rmSync(path, { force: true }); process.exit(code) }
  process.on('SIGINT', () => stop(130)); process.on('SIGTERM', () => stop(143))

  // 1. The emulator, its emulated time following the wall clock from the start (`pace on`, its stdin left open).
  const emu = spawn(emulator, emulatorArgs({ image: resolve(values.image), bench: sockets.bench, dsp: values.dsp }), { stdio: ['pipe', 'pipe', 'inherit'] })
  children.push(emu)
  emu.stdin.write('pace on\n')
  let ready = false
  emu.stdout.on('data', data => { if (/^ready /m.test(data.toString())) ready = true })
  emu.once('exit', code => { console.error('ot_emu exited (' + code + ')'); stop(1) })
  await until(() => ready && existsSync(sockets.bench), 180000, 'ot_emu to boot')
  // The base settles after the boot (loader refusal 5, RUNTIME_BUSY, before): emulated time is wall time now.
  await wait(Number(values.settle) * 1000)

  // 2. The session the unit's tools use, on the emulator's one bench connection.
  const serve = spawn(process.execPath, ['scripts/device.mjs', 'serve', '--emulator', '--socket', sockets.bench, '--share', sockets.share],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...sessionEnv(sockets) } })
  children.push(serve)
  serve.once('exit', code => { console.error('the session exited (' + code + ')'); stop(1) })
  await until(() => existsSync(sockets.share) && existsSync(sockets.dev), 60000, 'the session')
  console.log(`Emulator session: MODWERK_UNIT=emulator MODWERK_SHARE_SOCKET=${sockets.share} MODWERK_DEV_SOCKET=${sockets.dev}`)
  if (!command.length) { console.log('Ctrl-C ends it.'); return }

  // 3. The command, with the session in its environment; the session ends with it.
  const run = spawn(command[0], command.slice(1), { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, ...sessionEnv(sockets) } })
  run.once('exit', code => stop(code ?? 1))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
