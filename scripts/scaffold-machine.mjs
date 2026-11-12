import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMachineProfile, FAMILY_STEP_IDS, MACHINE_STACK } from '../src/devices/machine-contract.ts'

// npm run machine:new -- <id> --name "Name" [--family elektron|zoom|erica]
// Starts a machine as every machine starts: a profile with its family's steps and the Octatrack's stack, all open,
// and a guide that points at the recipe. It writes no code: each piece is built by extending the Octatrack's (docs/MACHINE_RECIPE.md).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2), id = args[0]
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] }
const name = option('--name'), family = option('--family', 'elektron'), steps = FAMILY_STEP_IDS[family]
if (!id || id.startsWith('--') || !name || !steps) throw new Error('Usage: npm run machine:new -- my-machine --name "My Machine" [--family elektron|zoom|erica]')
const folder = resolve(root, 'sdk/machines'), destination = resolve(folder, id)
try { await access(destination); throw new Error('Machine exists; edit its profile instead: sdk/machines/' + id + '/machine.json') } catch (error) { if (error.code !== 'ENOENT') throw error }
const orders = []
for (const entry of await readdir(folder, { withFileTypes: true })) if (entry.isDirectory()) orders.push(JSON.parse(await readFile(resolve(folder, entry.name, 'machine.json'), 'utf8')).order)
const open = ids => Object.fromEntries(ids.map(key => [key, 'open']))
const profile = {
  schemaVersion: 1, id, order: Math.max(0, ...orders) + 10, name, ...(family === 'elektron' ? {} : { family }), status: 'open',
  summary: 'No research yet.', steps: open(steps), stack: open(MACHINE_STACK.map(piece => piece.id)),
  art: family === 'zoom' ? { body: 'pedal', encoders: 0, trigs: 0, knobs: 3 } : { body: 'compact', encoders: 8, trigs: 16 },
}
parseMachineProfile(profile)
await mkdir(destination)
await writeFile(resolve(destination, 'machine.json'), JSON.stringify(profile, null, 2) + '\n')
await writeFile(resolve(destination, 'README.md'), `# ${name}\n\nWhere the ${name} stands and what comes next. Its progress is recorded in [machine.json](machine.json): the steps to the first mod, then each piece of the stack.\n\n## Modwerk stack\n\nThe ${name} is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)), each piece built by extending the Octatrack's:\n\n${MACHINE_STACK.map(piece => `- **${piece.title}** (\`stack.${piece.id}\`). ${piece.description}`).join('\n')}\n\nNone of it is started. When a piece moves, set it in the profile, say here what exists and how it was checked, and update the recipe's table.\n`)
console.log('Created sdk/machines/' + id + '\nBefore any implementation, message the owner on Discord (docs/ADD_A_MACHINE.md, Talk to the owner first).\nSet art and summary in machine.json, then: npm run machines:generate\nThe steps: docs/ADD_A_MACHINE.md. The stack after the first mod: docs/MACHINE_RECIPE.md.')
