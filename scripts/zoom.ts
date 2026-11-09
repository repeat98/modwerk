// SPDX-License-Identifier: GPL-3.0-or-later
// A Zoom MultiStomp from the command line, through the site's own ZoomLink over the computer's MIDI (zoom-device.ts):
//
//   npm run zoom -- status                  # model and firmware; on MIDISTOMP its version, features and load
//   npm run zoom -- list                    # every file, each effect's group, ID and version, and the free space
//   npm run zoom -- backup [OUT.zip]        # every file, read and checksum-checked, in a zip (default: ~/.cache/modwerk-local/zoom/)
//   npm run zoom -- install FILE.ZDL --yes  # writes: one added effect, read back and put in the effect list
//   npm run zoom -- remove NAME.ZDL --yes   # writes: one added effect out of the effect list and off the pedal
//
// Install and remove save the effect list from before in ~/.cache/modwerk-local/zoom/; power-cycle the pedal to load
// the change. Close Zoom Effect Manager and pedal pages in the browser first: their requests would mix with these.
import { registerHooks } from 'node:module'
import { homedir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { nodeMidiAccess, zoomCommand } from './zoom-device.ts'

const { values, positionals: [command, file, ...extra] } = parseArgs({ allowPositionals: true, options: { yes: { type: 'boolean', default: false } } })
if (!['status', 'list', 'backup', 'install', 'remove'].includes(command) || extra.length || (['install', 'remove'].includes(command) ? !file : file && command !== 'backup')) {
  console.error('Usage: npm run zoom -- status | list | backup [OUT.zip] | install FILE.ZDL --yes | remove NAME.ZDL --yes')
  process.exit(2)
}
// The site's sources import without extensions, as its bundler resolves them (also build-usb-audio-test.mjs).
const src = new URL('../src/', import.meta.url).href
registerHooks({ resolve: (specifier, context, next) => next(context.parentURL?.startsWith(src) && /^\.\.?\//.test(specifier) && !extname(specifier) ? specifier + '.ts' : specifier, context) })
const { ZoomLink } = await import('../src/engine/zoom/zoom-link.ts')

const access = await nodeMidiAccess(), link = new ZoomLink(async () => access)
const here = process.env.INIT_CWD ?? process.cwd()   // npm runs scripts from the repository root; paths are the caller's
try {
  await link.connect()
  const path = file && command !== 'remove' ? resolve(here, file) : file
  console.log(JSON.stringify(await zoomCommand(link, command, path, { dir: join(homedir(), '.cache/modwerk-local/zoom'), confirmed: values.yes }), null, 2))
} catch (error) {
  console.error((error as Error).message)
  process.exitCode = 1
} finally { access.close() }
