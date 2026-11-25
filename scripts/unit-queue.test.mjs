import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquire, describe as describeQueue, HOLD_GRACE, judge, parseDuration, priorityRequest, processEntry, readTurn, sequenceDrives, UnitBusyError, unitDirectory, waiting, windowsLaunch } from './unit-queue.mjs'

const script = fileURLToPath(new URL('./unit-queue.mjs', import.meta.url))
const goneProcess = () => Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout)
const until = async (test, ms = 15000) => {
  for (const start = Date.now(); Date.now() - start < ms; await new Promise(done => setTimeout(done, 20))) if (await test()) return true
  throw new Error('timed out waiting')
}
const MINUTE = 60000

let directory, places, env
const place = name => { const folder = join(places, name); mkdirSync(folder, { recursive: true }); return folder }
/** Separate processes share the queue. Wait for both output streams before checking a command's result. */
function cli(args, { cwd = place('a'), extra = {} } = {}) {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...env, ...extra } })
  const run = { child, out: '', err: '' }
  child.stdout.on('data', chunk => { run.out += chunk }); child.stderr.on('data', chunk => { run.err += chunk })
  run.exited = new Promise(done => child.once('exit', done))
  run.done = new Promise(done => child.once('close', done))
  return run
}
const quiet = { log: () => {}, poll: 20 }

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'unit-queue-'))
  places = mkdtempSync(join(tmpdir(), 'unit-places-'))
  env = { ...process.env, MODWERK_UNIT_DIR: directory }
  for (const name of ['MODWERK_UNIT_TURN', 'MODWERK_UNIT', 'MODWERK_UNIT_WHO', 'MODWERK_UNIT_KEEP']) delete env[name]
})
afterEach(() => { rmSync(directory, { recursive: true, force: true }); rmSync(places, { recursive: true, force: true }) })

describe('the unit queue', () => {
  it('keeps its state per user outside every checkout, or where MODWERK_UNIT_DIR says', () => {
    expect(unitDirectory({ MODWERK_UNIT_DIR: '/x/q' }, 'linux', '/home/u')).toBe('/x/q')
    expect(unitDirectory({}, 'linux', '/home/u')).toBe('/home/u/.local/state/modwerk/unit-queue')
    expect(unitDirectory({ XDG_STATE_HOME: '/s' }, 'linux', '/home/u')).toBe('/s/modwerk/unit-queue')
    expect(unitDirectory({}, 'darwin', '/Users/u')).toBe('/Users/u/Library/Application Support/modwerk/unit-queue')
    expect(unitDirectory({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32', 'C:\\Users\\u')).toMatch(/modwerk.unit-queue$/)
    expect(parseDuration('90s')).toBe(90000); expect(parseDuration('1h30m')).toBe(90 * MINUTE); expect(parseDuration('20')).toBe(20 * MINUTE)
    expect(() => parseDuration('soon')).toThrow(/Not a duration/)
  })

  it('says plainly when the unit is free, then who holds it and who waits, in order', async () => {
    const free = cli(['status'])
    expect(await free.done).toBe(0)
    expect(free.out).toMatch(/^The unit is free\.\nNobody is waiting\./)
    const hold = await acquire({ directory, cwd: place('owner'), kind: 'hold', note: 'playing by hand', forMs: 20 * MINUTE, env: {}, ...quiet })
    const first = acquire({ directory, cwd: place('one'), note: 'device:test tapehead', env: {}, ...quiet })
    await until(() => waiting(directory).length === 1)
    const second = acquire({ directory, cwd: place('two'), note: 'device:price everb', env: {}, ...quiet })
    await until(() => waiting(directory).length === 2)
    const status = cli(['status'])
    await status.done
    expect(status.out).toMatch(/The unit is in use: owner has it since \d\d:\d\d/)
    expect(status.out).toContain('doing: playing by hand')
    expect(status.out).toMatch(/a hold until \d\d:\d\d/)
    expect(status.out).toMatch(/Waiting, in order:\n {2}1\. one: device:test tapehead, waiting .*\n {2}2\. two: device:price everb/)
    const json = cli(['status', '--json'])
    await json.done
    expect(JSON.parse(json.out)).toMatchObject({ state: 'held', holder: { kind: 'hold', note: 'playing by hand' }, waiting: [{ note: 'device:test tapehead' }, { note: 'device:price everb' }] })
    hold.release()
    ;(await first).release()
    ;(await second).release()
    expect(describeQueue(directory).text).toBe('The unit is free.\nNobody is waiting.')
  })

  it('lets three contenders in, one at a time, in the order they came', async () => {
    const holder = await acquire({ directory, note: 'first', env: {}, ...quiet })
    const log = join(places, 'order.log'), runs = []
    for (const name of ['B', 'C', 'D']) {
      // Each one runs a command that notes its name, stays a moment, and notes it again: overlapping turns would interleave.
      runs.push(cli(['run', '--note', name, '--', process.execPath, '-e',
        `const fs = require('fs'); fs.appendFileSync(${JSON.stringify(log)}, '${name}<'); setTimeout(() => fs.appendFileSync(${JSON.stringify(log)}, '>${name} '), 150)`]))
      await until(() => waiting(directory).length === runs.length)
    }
    await until(() => runs[2].err.includes('number 3 in line'))
    expect(runs[0].err).toMatch(/Waiting for the unit: .* has it \(first\) .*You are number 1 in line/)
    holder.release()
    expect(await Promise.all(runs.map(run => run.done))).toEqual([0, 0, 0])
    expect(readFileSync(log, 'utf8')).toBe('B<>B C<>C D<>D ')
    expect(readTurn(directory)).toBe(null)
  })

  it('gives the turn back however the command ends: an error, SIGTERM or SIGALRM (the command stops as on Ctrl-C) or a kill', async () => {
    const failed = cli(['run', '--', process.execPath, '-e', 'process.exit(3)'])
    expect(await failed.done).toBe(3)
    expect(readTurn(directory)).toBe(null)

    // SIGTERM to the queue's process: the command gets SIGINT, so a trial rolls back, and the turn is given back after it.
    const marker = join(places, 'rolled-back')
    const stopped = cli(['run', '--note', 'trial', '--', process.execPath, '-e',
      `process.on('SIGINT', () => { require('fs').writeFileSync(${JSON.stringify(marker)}, 'rolled back'); process.exit(130) }); console.log('ready'); setInterval(() => {}, 1000)`])
    await until(() => readTurn(directory)?.holder?.child && stopped.out.includes('ready'))
    stopped.child.kill('SIGTERM')
    expect(await stopped.done).toBe(130)
    expect(readFileSync(marker, 'utf8')).toBe('rolled back')
    expect(readTurn(directory)).toBe(null)

    // SIGALRM (the `perl -e 'alarm N'` time limit around device-send.py) the same way: before, it ended the queue's process
    // alone, and the command it started was left running.
    if (process.platform !== 'win32') {
      rmSync(marker)
      const timed = cli(['run', '--note', 'timed read', '--', process.execPath, '-e',
        `process.on('SIGINT', () => { require('fs').writeFileSync(${JSON.stringify(marker)}, 'rolled back'); process.exit(130) }); console.log('ready'); setInterval(() => {}, 1000)`])
      await until(() => readTurn(directory)?.holder?.child && timed.out.includes('ready'))
      timed.child.kill('SIGALRM')
      expect(await timed.done).toBe(130)
      expect(readFileSync(marker, 'utf8')).toBe('rolled back')
      expect(readTurn(directory)).toBe(null)
    }

    // Killed outright, holder and command: the next in line finds the processes gone and takes over by itself.
    const killed = cli(['run', '--note', 'about to crash', '--', process.execPath, '-e', 'setInterval(() => {}, 1000)'])
    await until(() => readTurn(directory)?.holder?.child)
    const { holder } = readTurn(directory)
    const next = cli(['run', '--note', 'next', '--', process.execPath, '-e', 'console.log("ran")'], { cwd: place('b') })
    await until(() => next.err.includes('number 1 in line'))
    killed.child.kill('SIGKILL') // the queue's process first: alone, the command it started still holds the turn
    await killed.exited // the command still has the queue process's pipes open
    await new Promise(done => setTimeout(done, 100))
    expect(next.err).not.toMatch(/Taking over/)
    process.kill(holder.child.pid, 'SIGKILL')
    await killed.done
    expect(await next.done).toBe(0)
    expect(next.out).toContain('ran')
    expect(next.err).toMatch(/turn on the unit ended: its process ended without giving the turn back\. Taking over\. Check the unit before you change it/)
    expect(readTurn(directory)).toBe(null)
  })

  it('takes over from a holder whose process is gone, or that never wrote itself down', async () => {
    mkdirSync(join(directory, 'turn'))
    writeFileSync(join(directory, 'turn', 'holder.json'), JSON.stringify({ id: 'old', kind: 'run', pid: goneProcess(), who: 'crashed session', since: Date.now() - MINUTE, expectMs: MINUTE }))
    expect(judge(readTurn(directory))).toMatchObject({ state: 'dead' })
    expect(describeQueue(directory).text).toMatch(/^The unit is free: the last turn \(crashed session\) ended because its process ended/)
    const said = []
    const turn = await acquire({ directory, note: 'after a crash', env: {}, poll: 20, log: line => said.push(line) })
    expect(said.join('\n')).toMatch(/crashed session's turn on the unit ended/)
    expect(readTurn(directory).holder.note).toBe('after a crash')
    turn.release()

    mkdirSync(join(directory, 'turn'))
    const old = (Date.now() - MINUTE) / 1000
    utimesSync(join(directory, 'turn'), old, old)
    ;(await acquire({ directory, note: 'after a half-made turn', env: {}, ...quiet })).release()
    expect(readTurn(directory)).toBe(null)
  })

  it('reports a live holder past its expected end and never takes over from it', async () => {
    mkdirSync(join(directory, 'turn'))
    const holder = { id: 'live', kind: 'run', ...processEntry(process.pid), who: 'long session', note: 'device:qualify', checkout: '/elsewhere', since: Date.now() - 40 * MINUTE, expectMs: 15 * MINUTE }
    writeFileSync(join(directory, 'turn', 'holder.json'), JSON.stringify(holder))
    expect(describeQueue(directory).text).toMatch(/LATE: 2\d min past its expected end\. Its process still runs, so it keeps the unit/)
    const said = []
    await expect(acquire({ directory, note: 'impatient', env: {}, poll: 20, waitMs: 300, log: line => said.push(line) })).rejects.toThrow(UnitBusyError)
    expect(said.join('\n')).toMatch(/past its expected end and its process still runs, so it keeps the unit: a live turn is never taken over/)
    expect(readTurn(directory).holder.id).toBe('live')
    expect(waiting(directory)).toEqual([]) // giving up leaves the line
  })

  it('ends a hold past its time and grace only when someone waits and nothing of its own runs', async () => {
    mkdirSync(join(directory, 'turn'))
    const hold = { id: 'h', kind: 'hold', ...processEntry(goneProcess()), who: 'forgetful', note: 'by hand', checkout: '/elsewhere', since: Date.now() - 60 * MINUTE }
    writeFileSync(join(directory, 'turn', 'holder.json'), JSON.stringify({ ...hold, until: Date.now() - HOLD_GRACE / 2 }))
    expect(describeQueue(directory).text).toMatch(/OVER ITS TIME by 5 min\. Once 5 min more pass, the next one in line takes over\./)
    await expect(acquire({ directory, env: {}, ...quiet, waitMs: 200 })).rejects.toThrow(UnitBusyError) // within the grace: kept
    // A command of the holder's own still runs under the hold: kept, however late.
    writeFileSync(join(directory, 'turn', 'holder.json'), JSON.stringify({ ...hold, until: Date.now() - 2 * HOLD_GRACE }))
    writeFileSync(join(directory, 'turn', 'nested-1.json'), JSON.stringify({ ...processEntry(process.pid), note: 'device:test' }))
    await expect(acquire({ directory, env: {}, ...quiet, waitMs: 200 })).rejects.toThrow(UnitBusyError)
    rmSync(join(directory, 'turn', 'nested-1.json'))
    const said = []
    ;(await acquire({ directory, note: 'next', env: {}, poll: 20, log: line => said.push(line) })).release()
    expect(said.join('\n')).toMatch(/forgetful's hold on the unit ran out 2\d min ago with nothing of its own running\. Taking over\./)
  })

  it('holds for the owner or an agent across commands, released by its checkout only, shared by two worktrees', async () => {
    const top = mkdtempSync(join(tmpdir(), 'unit-worktrees-')), first = join(top, 'first'), second = join(top, 'second')
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: top, stdio: 'pipe' })
    try {
      git('init', '-q', '-b', 'main', first); git('-C', first, 'commit', '-q', '--allow-empty', '-m', 'base')
      git('-C', first, 'worktree', 'add', '-q', '-b', 'other', second, 'HEAD')
      const hold = cli(['hold', '--for', '20m', '--note', 'scripted pass by hand'], { cwd: first })
      expect(await hold.done).toBe(0)
      expect(hold.out).toMatch(/You hold the unit until \d\d:\d\d \(20 min\)/)

      // The other worktree sees the same queue, cannot release the hold, and waits for it.
      const seen = cli(['status'], { cwd: second })
      await seen.done
      expect(seen.out).toMatch(/The unit is in use: first \(main\) has it .*\n {2}doing: scripted pass by hand/)
      const refused = cli(['release'], { cwd: second })
      expect(await refused.done).toBe(1)
      expect(refused.err).toMatch(/This checkout holds no turn/)
      const impatient = cli(['run', '--wait', '1s', '--', process.execPath, '-e', ''], { cwd: second })
      expect(await impatient.done).toBe(3)
      expect(impatient.err).toMatch(/Waiting for the unit: first \(main\) has it \(scripted pass by hand\).*number 1 in line[\s\S]*Gave up waiting/)

      // The holder's own commands go ahead inside its hold, and see it as their turn.
      const id = readTurn(directory).holder.id
      const inside = cli(['run', '--note', 'device:test', '--', process.execPath, '-e', 'console.log(process.env.MODWERK_UNIT_TURN)'], { cwd: first })
      expect(await inside.done).toBe(0)
      expect(inside.out.trim()).toBe(id)
      const again = cli(['hold', '--for', '1h'], { cwd: first })
      expect(await again.done).toBe(0)
      expect(again.out).toMatch(/Hold extended until/)
      expect(readTurn(directory).holder.until).toBeGreaterThan(Date.now() + 50 * MINUTE)

      // A command from the other worktree waits in line and goes ahead by itself once the hold is released.
      const waiter = cli(['run', '--', process.execPath, '-e', 'console.log("second ran")'], { cwd: second })
      await until(() => waiting(directory).length === 1)
      const released = cli(['release'], { cwd: first })
      expect(await released.done).toBe(0)
      expect(await waiter.done).toBe(0)
      expect(waiter.out).toContain('second ran')

      // --force ends anyone's turn (the owner's call for a stuck one).
      expect(await cli(['hold'], { cwd: first }).done).toBe(0)
      const forced = cli(['release', '--force'], { cwd: second })
      expect(await forced.done).toBe(0)
      expect(forced.out).toMatch(/^Ended first \(main\) turn/)
      expect(readTurn(directory)).toBe(null)
    } finally { rmSync(top, { recursive: true, force: true }) }
  })

  it('keeps a run\'s turn for its checkout after the command ends (--keep, MODWERK_UNIT_KEEP), until release or its time', async () => {
    // 25 November 2026: other sessions took the unit in the seconds between a release's procedure run and its rerun, twice.
    const kept = cli(['run', '--keep', '10m', '--note', 'test:procedure', '--', process.execPath, '-e', 'console.log(process.env.MODWERK_UNIT_TURN)'])
    expect(await kept.done).toBe(0)
    const id = kept.out.trim()
    expect(kept.err).toMatch(/The turn stays this checkout's until \d\d:\d\d \(--keep 10 min\)/)
    expect(readTurn(directory).holder).toMatchObject({ id, kind: 'hold', kept: true, note: 'test:procedure' })
    expect(readTurn(directory).holder.until).toBeGreaterThan(Date.now() + 9 * MINUTE)
    expect(describeQueue(directory).text).toMatch(/kept for this checkout's next command until \d\d:\d\d/)

    // Another checkout waits; this checkout's next command (the rerun) goes ahead inside the kept turn and can extend it.
    const other = cli(['run', '--wait', '1s', '--', process.execPath, '-e', ''], { cwd: place('b') })
    expect(await other.done).toBe(3)
    expect(other.err).toMatch(/Waiting for the unit: a has it \(test:procedure\) .*kept for its next command until/)
    const rerun = cli(['run', '--', process.execPath, '-e', 'console.log(process.env.MODWERK_UNIT_TURN)'], { extra: { MODWERK_UNIT_KEEP: '30m' } })
    expect(await rerun.done).toBe(0)
    expect(rerun.out.trim()).toBe(id)
    expect(readTurn(directory).holder.until).toBeGreaterThan(Date.now() + 29 * MINUTE)
    expect(await cli(['release']).done).toBe(0)
    expect(readTurn(directory)).toBe(null)

    // A device command (takeUnitTurn) keeps its turn the same way under MODWERK_UNIT_KEEP.
    const device = spawn(process.execPath, ['--input-type=module', '-e', `import { takeUnitTurn } from ${JSON.stringify(new URL('./unit-queue.mjs', import.meta.url).href)}; await takeUnitTurn({ note: 'device try' })`],
      { cwd: place('c'), env: { ...env, MODWERK_UNIT_KEEP: '5m' } })
    expect(await new Promise(done => device.once('close', done))).toBe(0)
    expect(readTurn(directory).holder).toMatchObject({ kind: 'hold', kept: true, note: 'device try', who: 'c' })
    expect(await cli(['release'], { cwd: place('c') }).done).toBe(0)

    // A kept turn has no grace: past its time, with nothing of its own running, the next in line takes over at once.
    mkdirSync(join(directory, 'turn'))
    writeFileSync(join(directory, 'turn', 'holder.json'), JSON.stringify({ id: 'k', kind: 'hold', kept: true, ...processEntry(goneProcess()), who: 'finished release', note: 'test:procedure', checkout: '/elsewhere', since: Date.now() - 20 * MINUTE, until: Date.now() - 1000 }))
    const said = []
    ;(await acquire({ directory, cwd: place('b'), env: {}, poll: 20, log: line => said.push(line) })).release()
    expect(said.join('\n')).toMatch(/finished release's kept turn on the unit ran out \d+ s ago with nothing of its own running\. Taking over\./)
  })

  it('puts a priority waiter first, tells those it overtakes, and asks the holder to give the unit back at a safe point', async () => {
    const marker = join(places, 'go'), log = join(places, 'order.log')
    const note = name => [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(log)}, '${name} ')`]
    const holder = cli(['run', '--note', 'pricing run', '--', process.execPath, '-e',
      `const fs = require('fs'); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(marker)})) clearInterval(t) }, 20)`], { cwd: place('pricing') })
    await until(() => readTurn(directory)?.holder?.child)
    const early = cli(['run', '--note', 'device:test other', '--', ...note('early')], { cwd: place('early') })
    await until(() => waiting(directory).length === 1)
    const reason = 'owner: release Mackity before the pricing run'
    const release = cli(['run', '--priority', reason, '--note', 'test:procedure mackity', '--', ...note('release')], { cwd: place('release') })
    await until(() => waiting(directory).length === 2)
    expect(waiting(directory).map(entry => entry.who)).toEqual(['release', 'early'])
    expect(priorityRequest(directory)).toMatchObject({ who: 'release', priority: reason })
    await until(() => early.err.includes('ahead of you with priority'))
    expect(early.err).toContain(`release waits ahead of you with priority, the owner's call: ${reason}. You are number 2 in line.`)
    await until(() => release.err.includes('You wait first in line with priority'))

    // The holder sees it in status, in --json and in its command's output; nothing ends its turn.
    const status = cli(['status'])
    await status.done
    expect(status.out).toContain(`ASKED TO GIVE IT BACK: release waits first in line with priority (${reason})`)
    expect(status.out).toMatch(/ {2}1\. release: test:procedure mackity, waiting .*, first by priority: owner: release Mackity/)
    const json = cli(['status', '--json'])
    await json.done
    expect(JSON.parse(json.out).priority).toMatchObject({ who: 'release', priority: reason })
    await until(() => holder.err.includes('The unit is asked for'))
    expect(readTurn(directory).holder.note).toBe('pricing run')
    writeFileSync(marker, '')
    expect(await Promise.all([holder.done, release.done, early.done])).toEqual([0, 0, 0])
    expect(readFileSync(log, 'utf8')).toBe('release early ')
    expect(await cli(['run', '--priority', ' ', '--', process.execPath, '-e', '']).done).toBe(2)
  })

  it('lets a kept turn give way to a priority waiter, and keeps no turn while one waits', async () => {
    expect(await cli(['run', '--keep', '20m', '--', process.execPath, '-e', '']).done).toBe(0)
    await expect(acquire({ directory, cwd: place('b'), env: {}, ...quiet, waitMs: 200 })).rejects.toThrow(UnitBusyError) // a plain waiter waits
    const said = []
    ;(await acquire({ directory, cwd: place('c'), priority: 'owner: release first', env: {}, poll: 20, log: line => said.push(line) })).release()
    expect(said.join('\n')).toMatch(/a's kept turn gives way to your priority: nothing of its own runs\. Taking over\./)

    // A priority waiter first in line (a ticket of this live process): the kept checkout's next command waits in line
    // instead of going ahead inside its kept turn.
    const ticket = join(directory, `wait-0000000000001-${process.pid}-0.json`)
    const priority = JSON.stringify({ ...processEntry(process.pid), who: 'owner session', priority: 'release', since: Date.now() })
    expect(await cli(['run', '--keep', '20m', '--', process.execPath, '-e', '']).done).toBe(0)
    writeFileSync(ticket, priority)
    expect(judge(readTurn(directory), Date.now(), waiting(directory))).toMatchObject({ yields: true, expired: true })
    const next = cli(['run', '--wait', '1s', '--', process.execPath, '-e', ''])
    expect(await next.done).toBe(3)
    rmSync(ticket)
    expect(await cli(['release']).done).toBe(0)

    // A run that ends while a priority waiter is first gives the turn back instead of keeping it.
    const marker = join(places, 'go')
    const running = cli(['run', '--keep', '20m', '--', process.execPath, '-e', `const fs = require('fs'); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(marker)})) clearInterval(t) }, 20)`])
    await until(() => readTurn(directory)?.holder?.child)
    writeFileSync(ticket, priority)
    writeFileSync(marker, '')
    expect(await running.done).toBe(0)
    expect(running.err).toContain('Not kept: owner session waits first in line with priority (release), so the unit is theirs now.')
    expect(readTurn(directory)).toBe(null)
  })

  it('lets reads and emulators go beside a turn, and passes the turn to the commands a holder starts', async () => {
    const holder = await acquire({ directory, cwd: place('holder'), note: 'trial', env: {}, ...quiet })
    const read = cli(['run', '--steps', 'ui png:/tmp/screen.png stats', '--wait', '1s', '--', process.execPath, '-e', 'console.log("read")'])
    expect(await read.done).toBe(0)
    expect(read.out).toContain('read')
    const drive = cli(['run', '--steps', 'T5 FX2 FUNC+FX2', '--wait', '1s', '--', process.execPath, '-e', ''])
    expect(await drive.done).toBe(3)
    const emulator = cli(['run', '--wait', '1s', '--', process.execPath, '-e', 'console.log("emulated")'], { extra: { MODWERK_UNIT: 'emulator' } })
    expect(await emulator.done).toBe(0)
    // A child of the holder (MODWERK_UNIT_TURN, as device:test's trial is) runs inside the turn without waiting.
    const child = cli(['run', '--wait', '1s', '--', process.execPath, '-e', 'console.log("child")'], { extra: { MODWERK_UNIT_TURN: holder.id } })
    expect(await child.done).toBe(0)
    expect(readTurn(directory).holder.id).toBe(holder.id)
    holder.release()
  })

  it('tells reads from steps that drive the unit', () => {
    for (const line of ['ui', 'png:/tmp/a.png stats', 'mem:0x80000ec4:16 inventory missing', 'report loader crash stall diaglog', 'ui w300 screen', 'dspmap'])
      expect(sequenceDrives(line), line).toBe(false)
    for (const line of ['T5 FX2', 'pick:T1:FX2:E-Verb', 'part2', 'try /tmp/x.mwrm', 'remove /tmp/x.mwrm', 'boot /tmp/build', 'recover', 'guard', 'cpu',
      'gap', 'selftest', 'reload', 'ui w5000', 'PLAY w2000 guard', 'encA+3', 'dspmap:watch:5', 'profile', 'crashtest'])
      expect(sequenceDrives(line), line).toBe(true)
  })

  it('passes the command its arguments as they were given: no shell on Linux and macOS, quoted for cmd.exe on Windows', async () => {
    const words = ['a b', 'q"x', '$HOME', '*', 'x&y', '100%']
    const run = cli(['run', '--', process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...words])
    expect(await run.done).toBe(0)
    expect(JSON.parse(run.out)).toEqual(words)

    // Windows: an .exe starts directly, and Node quotes its arguments.
    const env = { PATH: 'C:\\Python;C:\\Program Files\\nodejs', PATHEXT: '.EXE;.CMD', ComSpec: 'C:\\Windows\\system32\\cmd.exe' }
    expect(windowsLaunch(['python', '-B', 'x y.py'], env, path => path === 'C:\\Python\\python.EXE')).toEqual({ file: 'C:\\Python\\python.EXE', args: ['-B', 'x y.py'] })
    expect(windowsLaunch(['tool', 'a b'], env, () => false)).toEqual({ file: 'tool', args: ['a b'] })
    // npm is a .cmd: one verbatim cmd.exe line, each argument quoted and caret-escaped for cmd and again for the batch file.
    const npm = windowsLaunch(['npm', 'run', '--', 'a b&calc', 'q"x', '100%', 'C:\\dir\\'], env, path => path === 'C:\\Program Files\\nodejs\\npm.CMD')
    expect(npm).toEqual({ file: 'C:\\Windows\\system32\\cmd.exe', verbatim: true, args: ['/d', '/s', '/c',
      '"C:\\Program^ Files\\nodejs\\npm.CMD ^^^"run^^^" ^^^"--^^^" ^^^"a^^^ b^^^&calc^^^" ^^^"q\\^^^"x^^^" ^^^"100^^^%^^^" ^^^"C:\\dir\\\\^^^""'] })
  })
})
