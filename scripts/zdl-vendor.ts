// npm run zdl:vendor -- [<id> …] --checker <ZoomMultistompZDL checkout> --stock-dir <folder with the stock blobs>
//
// Puts each Zoom effect module's pinned release file (platform.binary in modwerk.module.json) where the site serves it,
// public/zoom-effects/<id>/<version>/<file>, and removes files no module names any more. A new file is downloaded from the
// author's GitHub release, checked against its SHA-256 and size, and kept only if ZoomMultistompZDL's
// build/check_no_stock.py finds no code from Zoom's effects in it: Modwerk hosts no Zoom code. That check needs the stock
// blobs the linker used to take (docs/STOCK-FILES.md there), which stay on the developer's computer.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseMachineProfile, type MachineProfile } from '../src/devices/machine-contract.ts'
import { parseModwerkModule, type ModwerkModule, type ZdlPlatform } from '../src/catalog/module-contract-v3.ts'
import { ZDL_FOLDER, unlistedZdl, zdlPath } from './zdl-binaries.mjs'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2), option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args.splice(at, 2)[1] : undefined }
const checker = option('--checker'), stockDir = option('--stock-dir'), only = new Set(args)
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

const profiles: MachineProfile[] = readdirSync(resolve(root, 'sdk/machines'), { withFileTypes: true }).filter(entry => entry.isDirectory())
  .map(entry => parseMachineProfile(JSON.parse(readFileSync(resolve(root, 'sdk/machines', entry.name, 'machine.json'), 'utf8'))))
const folders = [...new Set(profiles.filter(profile => profile.sdk?.platform === 'zdl').map(profile => profile.sdk!.modules))]
type ZdlModule = ModwerkModule & { platform: ZdlPlatform }
const modules: ZdlModule[] = folders.flatMap(folder => existsSync(resolve(root, folder)) ? readdirSync(resolve(root, folder), { withFileTypes: true }) : [])
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
  .map(entry => parseModwerkModule(JSON.parse(readFileSync(join(entry.parentPath, entry.name, 'modwerk.module.json'), 'utf8')), profiles) as ZdlModule)

for (const module of modules.filter(module => !only.size || only.has(module.id))) {
  const target = resolve(root, zdlPath(module)), { binary } = module.platform
  if (existsSync(target) && sha256(readFileSync(target)) === binary.sha256) { console.log(module.id + ': ' + zdlPath(module) + ' is the pinned file'); continue }
  if (!checker || !stockDir) throw new Error(module.id + ': a new file needs --checker <ZoomMultistompZDL checkout> and --stock-dir <folder with linesel_handlers.bin, air_knob3_edit.bin and divf_rts.bin>, so it is kept only without Zoom code')
  const url = binary.release.repository + '/releases/download/' + encodeURIComponent(binary.release.tag) + '/' + encodeURIComponent(binary.release.asset)
  const response = await fetch(url)
  if (!response.ok) throw new Error(module.id + ': ' + url + ' answered ' + response.status)
  const data = new Uint8Array(await response.arrayBuffer())
  if (sha256(data) !== binary.sha256 || data.length !== binary.bytes) throw new Error(module.id + ': ' + url + ' is not the pinned file (sha256 ' + sha256(data) + ', ' + data.length + ' bytes)')
  const scratch = mkdtempSync(join(tmpdir(), 'zdl-vendor-')), file = join(scratch, module.platform.file)
  writeFileSync(file, data)
  const check = spawnSync('python3', [resolve(checker, 'build/check_no_stock.py'), file, '--stock-dir', resolve(stockDir)], { cwd: resolve(checker, 'build'), encoding: 'utf8' })
  rmSync(scratch, { recursive: true, force: true })
  process.stdout.write(check.stdout)
  if (check.status !== 0) throw new Error(module.id + ': not vendored. ' + (check.stderr || 'The file carries code from Zoom’s effects; rebuild it with own_runtime.'))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, data)
  console.log(module.id + ': ' + zdlPath(module) + ' vendored from ' + url)
}

// A module update replaces its file: delete what no module names.
try { unlistedZdl(root, modules) } catch {
  const named = new Set(modules.map(zdlPath)), walk = (path: string): string[] => readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path + '/' + entry.name) : [path + '/' + entry.name])
  for (const path of walk(ZDL_FOLDER).filter(path => !named.has(path))) { rmSync(resolve(root, path)); console.log('removed ' + path + ': no module names it') }
}
