// An Octatrack emulator session that the unit's tools drive like a unit: ot_emu on a development twin, paced to the wall clock
// so every wait in device:test means the same as on the unit, served by `npm run device -- serve --emulator`.
//
//   npm run device:emulator -- --image MAIN.raw [--emulator PATH] [--dsp] [--mki] [--dir DIR]  # until Ctrl-C; --mki: an MKI
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

/** ot_emu's arguments: the line protocol on stdin (so `pace on` can tie emulated time to the wall clock), the USB bench. An MKII
 * unless `mki`: stock then takes the MKI's panel and its gestures (no PART key; device.mjs part() and the Part menu, #2099). */
export function emulatorArgs({ image, bench, dsp = false, mki = false }) {
  return ['--interactive', '--image', image, '--usb-host', bench, '--max', '400000000000', ...(mki ? [] : ['--mkii']), ...(dsp ? ['--dsp', '--dsp-rt', '--frame'] : [])]
}

/** The sockets of a session in DIR, and the environment the unit's tools need to use it. */
export function sessionSockets(dir) {
  // A Unix socket path is limited to about 104 characters on macOS: keep DIR short.
  return { bench: join(dir, 'bench.sock'), dev: join(dir, 'dev.sock'), share: join(dir, 'share.sock') }
}
export const sessionEnv = sockets => ({ MODWERK_UNIT: 'emulator', MODWERK_SHARE_SOCKET: sockets.share, MODWERK_DEV_SOCKET: sockets.dev })

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, ms, what, failed = () => null) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(250)) {
    if (test()) return
    const why = failed()
    if (why) throw new Error(why)
  }
  throw new Error('timed out waiting for ' + what)
}

/** Start a session: ot_emu on IMAGE, settled, and `device.mjs serve --emulator` sharing it. Resolves once the shared and line
 * sockets exist, with stop() (ends both and removes the sockets) and `ended`, which resolves with a line when either process
 * stops by itself. `log` takes what both print (ot_emu's stderr); `spawn` and `exists` are the tests' seams. */
export async function startSession({ emulator, image, dsp = false, mki = false, dir, settle = 20, log = text => process.stderr.write(text),
  spawn: run = spawn, exists = existsSync, bootMs = 180000 }) {
  mkdirSync(dir, { recursive: true })
  const sockets = sessionSockets(dir)
  for (const path of Object.values(sockets)) rmSync(path, { force: true })
  const children = [], exited = new Map()
  let stopping = false, ended
  const endedPromise = new Promise(resolve => { ended = resolve })
  const watch = (child, name, { stdout = true } = {}) => { // ot_emu's stdout is its line protocol's replies: not logged
    children.push({ child, name })
    if (stdout) child.stdout?.on('data', data => log(data.toString()))
    child.stderr?.on('data', data => log(data.toString()))
    child.once('error', error => { exited.set(name, error.message); if (!stopping) ended(name + ' did not start: ' + error.message) })
    child.once('exit', code => { exited.set(name, 'exit ' + code); if (!stopping) ended(name + ' exited (' + code + ')') })
  }
  const stop = async () => {
    stopping = true
    const running = children.filter(({ name }) => !exited.has(name))
    for (const { child } of [...running].reverse()) child.kill('SIGTERM')
    await Promise.race([Promise.all(running.map(({ child }) => new Promise(r => child.once('exit', r)))), wait(10000)])
    for (const { child, name } of running) if (!exited.has(name)) child.kill('SIGKILL')
    for (const path of Object.values(sockets)) rmSync(path, { force: true })
  }
  try {
    // 1. The emulator, its emulated time following the wall clock from the start (`pace on`, its stdin left open).
    const emu = run(emulator, emulatorArgs({ image: resolve(image), bench: sockets.bench, dsp, mki }), { stdio: ['pipe', 'pipe', 'pipe'] })
    let ready = false
    emu.stdout?.on('data', data => { if (/^ready /m.test(data.toString())) ready = true })
    watch(emu, 'ot_emu', { stdout: false })
    emu.stdin?.on('error', () => {}) // an emulator that stops at once closes its stdin: the exit says why
    emu.stdin?.write('pace on\n')
    const gone = name => () => exited.has(name) ? name + ' ended before the session was ready (' + exited.get(name) + ')' : null
    await until(() => ready && exists(sockets.bench), bootMs, 'ot_emu to boot', gone('ot_emu'))
    // The base settles after the boot (loader refusal 5, RUNTIME_BUSY, before): emulated time is wall time now.
    for (const end = Date.now() + settle * 1000; Date.now() < end && !exited.has('ot_emu');) await wait(Math.min(250, settle * 1000))
    if (gone('ot_emu')()) throw new Error(gone('ot_emu')())

    // 2. The session the unit's tools use, on the emulator's one bench connection.
    watch(run(process.execPath, ['scripts/device.mjs', 'serve', '--emulator', '--socket', sockets.bench, '--share', sockets.share],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...sessionEnv(sockets) } }), 'the session')
    await until(() => exists(sockets.share) && exists(sockets.dev), 60000, 'the session', () => gone('ot_emu')() ?? gone('the session')())
  } catch (error) {
    await stop()
    throw error
  }
  return { sockets, env: sessionEnv(sockets), stop, ended: endedPromise }
}

async function main() {
  const split = process.argv.indexOf('--')
  const own = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split), command = split < 0 ? [] : process.argv.slice(split + 1)
  const { values } = parseArgs({ args: own, options: { image: { type: 'string' }, emulator: { type: 'string' }, dsp: { type: 'boolean' },
    mki: { type: 'boolean' }, dir: { type: 'string' }, settle: { type: 'string', default: '20' } } })
  const emulator = values.emulator ?? process.env.MODWERK_OT_EMU
  if (!values.image || !emulator) {
    console.error('Usage: npm run device:emulator -- --image MAIN.raw --emulator OT_EMU [--dsp] [--mki] [--dir DIR] [--settle 20] [-- COMMAND…]\n' +
      '(MODWERK_OT_EMU names the adapted ot_emu from scripts/octatrack-emulator/build.py; docs/TEST_PROCEDURE.md, "One set of cases, two targets")')
    process.exit(2)
  }
  let session
  const end = async code => { await session?.stop(); process.exit(code) }
  process.on('SIGINT', () => end(130)); process.on('SIGTERM', () => end(143))
  try {
    session = await startSession({ emulator, image: values.image, dsp: values.dsp, mki: values.mki, settle: Number(values.settle),
      dir: resolve(values.dir ?? join(tmpdir(), 'mw-emu-' + process.pid)) })
  } catch (error) { console.error(error.message); process.exit(1) }
  session.ended.then(why => { console.error(why); end(1) })
  const { sockets } = session
  console.log(`Emulator session: MODWERK_UNIT=emulator MODWERK_SHARE_SOCKET=${sockets.share} MODWERK_DEV_SOCKET=${sockets.dev}`)
  if (!command.length) { console.log('Ctrl-C ends it.'); return }

  // 3. The command, with the session in its environment; the session ends with it.
  const run = spawn(command[0], command.slice(1), { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, ...session.env } })
  run.once('exit', code => end(code ?? 1))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
