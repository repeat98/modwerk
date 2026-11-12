// SPDX-License-Identifier: GPL-3.0-or-later
// Edit, build, hear: an Octatrack module from its source onto your unit, in one command.
//
//   npm run module:dev -- <id>                 # build it, then try it on the unit over USB; Ctrl-C or the end of the trial undoes it
//   npm run module:dev -- <id> --watch         # and again after every saved change (the running trial is undone first)
//   npm run module:dev -- <id> --build-only    # only the package; prints where it is
//   npm run module:dev -- <id> --emulator --socket SOCK   # ot_emu's USB bench instead of the unit
//
// A draft (sdk/drafts/<id>) is staged under sdk/octatrack/modules/ while this runs, as module:doctor --draft does. The package is
// built by scripts/module-dev-package.py with the same builder as the site's packages, written outside the checkout, and loaded
// by `npm run device -- try`: a trial in RAM that is rolled back unless you keep it with `npm run device -- try FILE --accept`.
// Needs: the unit on a Modwerk base and the USB bridge (docs/OCTATRACK_DRIVING.md), m68k-elf binutils for ColdFire code and
// Octabam's dsp_asm for DSP code (docs/ADD_A_MODULE.md, The fast loop). No firmware, no Docker, no catalogue entry.
import { existsSync, mkdirSync, watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { draftFolder, listedFolder, stageDraft } from './draft-stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values, positionals: [id, ...extra] } = parseArgs({ allowPositionals: true, options: {
  watch: { type: 'boolean', default: false },
  listed: { type: 'boolean', default: false },
  'build-only': { type: 'boolean', default: false },
  seconds: { type: 'string', default: '600' },
  out: { type: 'string' },
  socket: { type: 'string' },
  emulator: { type: 'boolean', default: false },
  slots: { type: 'string' }, cycles: { type: 'string' }, 'cycles-kind': { type: 'string' }, state: { type: 'string' }, buffer: { type: 'string' },
} })
if (!id || extra.length || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run module:dev -- <id> [--watch] [--build-only] [--listed] [--seconds 1-3600] [--out FILE] [--socket PATH] [--emulator]\n' +
    '                     [--slots fx1|fx2|both] [--cycles N] [--cycles-kind executed|modeled|hardware] [--state N] [--buffer N]')
  process.exit(2)
}
const hasDraft = existsSync(draftFolder(root, id)), hasListed = existsSync(listedFolder(root, id))
if (!hasDraft && !hasListed) { console.error('No module named ' + id + ' under sdk/drafts or sdk/octatrack/modules. Start one with npm run module:new.'); process.exit(2) }
// A draft of a listed module's next version cannot be staged over the listed folder; build the listed one with --listed.
if (hasDraft && hasListed && !values.listed) { console.error('Both sdk/drafts/' + id + ' and sdk/octatrack/modules/' + id + ' exist. Give --listed to build the listed one; the draft of its next version is built once it replaces the listed folder on your branch.'); process.exit(2) }
const draft = hasDraft && !values.listed
const refresh = draft ? stageDraft(root, id) : () => {}
const source = draft ? draftFolder(root, id) : listedFolder(root, id)
// Built packages never go in the checkout (AGENTS.md): they live beside the system's temporary files.
const out = resolve(values.out ?? join(tmpdir(), 'modwerk-dev', id + '.mwrm'))
mkdirSync(dirname(out), { recursive: true })
const python = process.platform === 'win32' ? 'python' : 'python3'
const figures = ['slots', 'cycles', 'cycles-kind', 'state', 'buffer'].flatMap(name => values[name] ? ['--' + name, values[name]] : [])
const device = [...(values.socket ? ['--socket', values.socket] : []), ...(values.emulator ? ['--emulator'] : [])]

const run = (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit' })
const finished = child => new Promise(resolve => child.once('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1))))

async function build() {
  refresh()
  const code = await finished(run(python, ['-B', 'scripts/module-dev-package.py', id, '-o', out, ...figures]))
  if (code === 0) console.log('Built ' + out + (draft ? ' from sdk/drafts/' + id : ''))
  else console.error('The build failed (above). Nothing was sent to the unit.')
  return code === 0
}
const trial = () => run(process.execPath, ['scripts/device.mjs', 'try', out, '--seconds', values.seconds, ...device])

if (!values.watch) {
  if (!await build()) process.exit(1)
  if (values['build-only']) process.exit(0)
  console.log('Trying it on the unit for ' + values.seconds + ' s. Ctrl-C undoes it now; to keep it: npm run device -- try ' + out + ' --accept')
  process.exit(await finished(trial()))
}

// Watch: one build, one trial at a time. A change undoes the running trial (SIGINT, as Ctrl-C does), rebuilds and tries again.
let current = null, pending = false, busy = false, timer = null
async function cycle() {
  if (busy) { pending = true; return }
  busy = true
  do {
    pending = false
    if (current) { const stopping = finished(current); current.kill('SIGINT'); await stopping; current = null }
    if (await build() && !values['build-only']) {
      current = trial()
      const mine = current
      finished(mine).then(code => { if (current === mine) { current = null; console.log('Trial ended (' + code + '). Save a file to build and try again.') } })
    }
  } while (pending)
  busy = false
  console.log('Watching ' + source + ' (Ctrl-C to stop).')
}
watch(source, { recursive: true }, (_, name) => {
  if (!name || /(^|\/)(\.|__pycache__)|~$|\.sw.$/.test(name)) return
  clearTimeout(timer); timer = setTimeout(cycle, 300)
})
process.on('SIGINT', () => { if (current) current.kill('SIGINT'); process.exit(130) })
await cycle()
