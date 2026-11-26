#!/usr/bin/env node
// The Part a test run starts on, read before the run changes anything and put back after it, so the next run finds the test
// bank as clean as this one did (docs/TEST_PROCEDURE.md: steps 6 and 10, and #a-test-bank).
//
//   node scripts/octatrack-part-state.mjs read --socket SOCK --out FILE [--programs 32-35]
//   node scripts/octatrack-part-state.mjs restore --socket SOCK --start FILE
//
// `read` notes the bank, pattern, Part and transport and, for the current bank (and every bank --programs reaches), which of
// its four Parts has a working copy equal to its saved one. A clean current Part is SAVEd once, stopped, as device:test does:
// the same bytes, but after a RAM boot RELOAD refuses a Part not saved since (SAVE PART FIRST!). `restore` stops the transport
// if it was stopped at the start, goes back to that bank, pattern and Part, RELOADs the Part when it was clean at the start and
// differs now, and checks both copies against the saved copy read first. A Part that differed at the start is left as found:
// its edits are not the run's to discard. It prints one JSON line ({"part": …}) and, for each thing it could not put back,
// a line "not put back: …" with the fix; then it exits 1. OS 1.40C's addresses (docs/OCTATRACK_DRIVING.md#where-the-state-is-os-140c).
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parsePrograms } from './octatrack-soak.mjs'

export const PART = 0x80000003, BANK_POINTER = 0x46c82456, NOW = 0x800065bd, PART_BYTES = 6322
export const bankBase = bank => 0x400e21e0 + bank * 0x9b340
export const copyAt = (bank, part, saved) => bankBase(bank) + (saved ? 0x9504a : 0x8ed80) + part * PART_BYTES
export const where = (bank, pattern) => 'ABCDEFGHIJKLMNOP'[bank] + String(pattern + 1).padStart(2, '0')
const bankName = bank => 'bank ' + 'ABCDEFGHIJKLMNOP'[bank]
/** Programs that select patterns 1 to 4 of a bank (bank A pattern 1 is program 0, bank B pattern 1 is 16). */
export const bankPrograms = bank => `${bank * 16}-${bank * 16 + 3}`
/** The banks a soak's program list reaches. */
export const banksOf = programs => [...new Set(parsePrograms(programs).map(program => program >> 4))]

const hexLines = text => String(text ?? '').split('\n').map(line => line.trim()).filter(line => /^[0-9a-f]+$/.test(line))
const digest = hex => createHash('sha256').update(hex).digest('hex').slice(0, 16)
const mem = (at, length) => `mem:0x${at.toString(16)}:${length}`

/** Where the unit is: transport, bank, pattern, Part and the bank pointer (one read-only line). */
async function position(send) {
  const out = await send(['state', mem(NOW, 2), mem(PART, 1), mem(BANK_POINTER, 4)].join(' '))
  const hex = hexLines(out)
  if (hex.length !== 3 || !/^(stopped|playing)/m.test(out)) throw new Error('The unit did not answer the position read: ' + String(out).trim().split('\n').slice(-2).join(' / '))
  const position = { stopped: /^stopped/m.test(out), bank: parseInt(hex[0].slice(0, 2), 16), pattern: parseInt(hex[0].slice(2, 4), 16), part: parseInt(hex[1], 16) }
  if (parseInt(hex[2], 16) !== bankBase(position.bank))
    throw new Error(`The current bank's base reads 0x${hex[2]}, not 0x${bankBase(position.bank).toString(16)} where OS 1.40C keeps ${bankName(position.bank)}: this tool knows only that layout`)
  return position
}

/** Each listed Part of a bank: its working and saved copies' digests, and whether they are equal. */
async function copies(send, bank, parts = [0, 1, 2, 3]) {
  const hex = hexLines(await send(parts.flatMap(part => [mem(copyAt(bank, part, false), PART_BYTES), mem(copyAt(bank, part, true), PART_BYTES)]).join(' ')))
  if (hex.length !== 2 * parts.length || hex.some(line => line.length !== 2 * PART_BYTES)) throw new Error(`The Parts of ${bankName(bank)} did not read whole`)
  return parts.map((part, i) => { const working = digest(hex[2 * i]), saved = digest(hex[2 * i + 1]); return { part: part + 1, working, saved, clean: working === saved } })
}

/** Step 6: the start, and the clean current Part SAVEd once (stopped) so that its RELOAD works at the end. */
export async function readStart(send, { banks = [] } = {}) {
  const at = await position(send), state = { ...at, saved: false, banks: {} }
  for (const bank of [...new Set([at.bank, ...banks])]) state.banks[bank] = await copies(send, bank)
  const start = state.banks[at.bank][at.part], name = `Part ${at.part + 1} on ${where(at.bank, at.pattern)}`
  if (!start.clean) state.summary = `${name} differs from its saved copy, so the run leaves it as found and does not reload it: start on a test bank whose Part is saved (docs/TEST_PROCEDURE.md#a-test-bank)`
  else if (!at.stopped) state.summary = `${name}: working = saved; not saved once, as the transport was playing, so after a RAM boot its RELOAD at the end can be refused`
  else {
    await send('NO w200 savepart')
    const [now] = await copies(send, at.bank, [at.part])
    if (now.working !== start.saved || now.saved !== start.saved) throw new Error(`Saving ${name}, so that RELOAD works at the end, changed it: check the unit before going on`)
    state.saved = true
    state.summary = `${name}: working = saved, saved once so that RELOAD works at the end`
  }
  return state
}

/** Step 10 (and the soak's end): the start position and the start Part as saved again. Returns {ok, summary, actions, problems}. */
export async function restore(send, start) {
  const actions = [], problems = [], name = `Part ${start.part + 1} on ${where(start.bank, start.pattern)}`
  let now = await position(send)
  // STOP also when it reads stopped: a MIDI STOP pauses the sequencer, which reads as stopped from base 0.8 on.
  if (start.stopped) { await send('STOP w300'); if (!now.stopped) actions.push('transport stopped'); now = await position(send) }
  if (now.bank !== start.bank || now.pattern !== start.pattern) {
    await send(`BANK w150 TRIG${start.bank + 1} w150 TRIG${start.pattern + 1} w500`)
    const was = where(now.bank, now.pattern)
    now = await position(send)
    if (now.bank !== start.bank || now.pattern !== start.pattern)
      problems.push(`not back on ${where(start.bank, start.pattern)} (it is on ${where(now.bank, now.pattern)}): select it by hand (BANK, TRIG ${start.bank + 1}, TRIG ${start.pattern + 1}), then run this again`)
    else actions.push(`back on ${where(start.bank, start.pattern)} from ${was}`)
  }
  if (!problems.length && now.part !== start.part) {
    // A Part switch assigns that Part to the pattern (stock): the pattern's own Part again.
    await send(`part${start.part + 1}`)
    now = await position(send)
    if (now.part !== start.part) problems.push(`Part ${start.part + 1} is not selected again (it is on Part ${now.part + 1}): select it by hand`)
    else actions.push(`Part ${start.part + 1} selected again`)
  }
  const first = start.banks[start.bank][start.part]
  if (!problems.length && first.clean) {
    let [part] = await copies(send, start.bank, [start.part])
    if (part.saved !== first.saved)
      problems.push(`the saved copy of ${name} changed during the run (something saved over it), so RELOAD cannot bring it back: reload the project without saving it, or put the Part back by hand (docs/OCTATRACK_DRIVING.md#the-rules)`)
    else if (part.working !== first.saved) {
      await send('NO w200 reload');
      [part] = await copies(send, start.bank, [start.part])
      if (part.working === first.saved && part.saved === first.saved) actions.push(`${name} reloaded`)
      else {
        await send('NO w200') // the SAVE PART FIRST! message
        problems.push(`RELOAD did not bring ${name} back${start.saved ? '' : ' (SAVE PART FIRST!: step 6 could not save it, as the transport was playing)'}: ` +
          'put it back by hand (docs/OCTATRACK_DRIVING.md#the-rules) or reload the project without saving it, and start the next run on a stopped, saved test bank')
      }
    }
  }
  // Every other Part read at the start that was saved then and differs now: the run changed it, and only its own Part is reloaded.
  for (const [bank, parts] of Object.entries(start.banks)) {
    const was = parts.filter(part => part.clean && !(Number(bank) === start.bank && part.part === start.part + 1))
    if (!was.length) continue
    for (const part of await copies(send, Number(bank), was.map(p => p.part - 1)))
      if (!part.clean) problems.push(`Part ${part.part} of ${bankName(Number(bank))} was saved at the start and differs now: reload it by hand (a pattern on that Part, then FUNC+PART, RELOAD), and keep the run on one Part of the test bank (--soak-programs ${bankPrograms(start.bank)})`)
  }
  const ok = !problems.length
  const summary = !ok ? problems.join('; ')
    : !first.clean ? `${name} differed from its saved copy at the start, so it was left as found${actions.length ? '; ' + actions.join(', ') : ''}`
    : `${name}: ${actions.join(', ') || 'nothing to put back'}; working = saved`
  return { ok, summary, actions, problems }
}

/** One `device.mjs do` line on the session, its output; a failed command throws. */
function deviceDo(socket) {
  const script = fileURLToPath(new URL('./device.mjs', import.meta.url))
  return async line => {
    const run = spawnSync(process.execPath, [script, 'do', line, '--socket', socket], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const output = (run.stdout ?? '') + (run.stderr ?? '')
    if (run.status !== 0 || /^error: /m.test(output)) throw new Error(`device.mjs do '${line.slice(0, 60)}' failed: ` + output.trim().split('\n').slice(-2).join(' / '))
    return output
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    socket: { type: 'string', default: process.env.MODWERK_SHARE_SOCKET ?? '/tmp/modwerk-share.sock' }, out: { type: 'string' }, start: { type: 'string' }, programs: { type: 'string' } } })
  const [verb] = positionals
  if (!['read', 'restore'].includes(verb) || (verb === 'read' && !values.out) || (verb === 'restore' && !values.start)) {
    console.error('Usage: octatrack-part-state.mjs read --socket SOCK --out FILE [--programs 32-35]\n       octatrack-part-state.mjs restore --socket SOCK --start FILE')
    process.exit(2)
  }
  const send = deviceDo(values.socket)
  try {
    if (verb === 'read') {
      const state = await readStart(send, { banks: values.programs ? banksOf(values.programs) : [] })
      writeFileSync(values.out, JSON.stringify(state, null, 1) + '\n')
      console.log(JSON.stringify({ part: state }))
    } else {
      if (!existsSync(values.start)) {
        console.log(`not put back: no reading of the Part from the start (${values.start}), so nothing was reloaded: compare the Part with its saved copy by hand (docs/OCTATRACK_DRIVING.md#where-the-state-is-os-140c)`)
        process.exit(1)
      }
      const result = await restore(send, JSON.parse(readFileSync(values.start, 'utf8')))
      console.log(JSON.stringify({ part: result }))
      for (const problem of result.problems) console.log('not put back: ' + problem)
      process.exit(result.ok ? 0 : 1)
    }
  } catch (error) {
    console.log((verb === 'read' ? 'not read: ' : 'not put back: ') + error.message)
    process.exit(1)
  }
}
