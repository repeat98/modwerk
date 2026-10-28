import { readFile, readdir, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMachineProfile } from '../src/devices/machine-contract.ts'

// Validates sdk/machines/<id>/machine.json and writes the website's machine registry from them.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), folder = resolve(root, 'sdk/machines')
const target = resolve(root, 'src/devices/machines.generated.json'), write = process.argv.includes('--write')
const exists = async path => { try { await access(resolve(root, path)); return true } catch { return false } }
const profiles = []
for (const entry of await readdir(folder, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  let profile
  try { profile = parseMachineProfile(JSON.parse(await readFile(resolve(folder, entry.name, 'machine.json'), 'utf8'))) } catch (error) { throw new Error('sdk/machines/' + entry.name + ': ' + error.message, { cause: error }) }
  if (profile.id !== entry.name) throw new Error('sdk/machines/' + entry.name + ': id must match its folder')
  if (profile.sdk) for (const path of [profile.sdk.modules, profile.sdk.guide, ...(profile.sdk.catalog ? [profile.sdk.catalog] : []), ...(profile.sdk.core?.path ? [profile.sdk.core.path] : [])])
    if (!await exists(path)) throw new Error(profile.id + ': SDK path does not exist: ' + path)
  // An agent on a machine reads its guide first, so every guide points at the stack every machine gets.
  const guide = 'sdk/machines/' + entry.name + '/README.md', text = await exists(guide) ? await readFile(resolve(root, guide), 'utf8') : null
  if (text !== null && (!/^## Modwerk stack$/m.test(text) || !text.includes('docs/MACHINE_RECIPE.md')))
    throw new Error(guide + ': link docs/MACHINE_RECIPE.md in a "## Modwerk stack" section saying where this machine stands')
  profiles.push(profile)
}
profiles.sort((a, b) => a.order - b.order)
const orders = profiles.map(profile => profile.order)
if (new Set(orders).size !== orders.length) throw new Error('Machine order values must be unique')
const generated = JSON.stringify(profiles, null, 2) + '\n'
if (write) await writeFile(target, generated)
else if ((await readFile(target, 'utf8').catch(() => '')) !== generated) throw new Error('src/devices/machines.generated.json is stale; run npm run machines:generate')
console.log('Validated ' + profiles.length + ' machine profiles (' + profiles.filter(profile => profile.sdk).length + ' with SDKs)' + (write ? '; registry written' : ''))
