// SPDX-License-Identifier: GPL-3.0-or-later
// A module's host tests: every test_*.py file in its folder, at any depth. A host test needs no firmware, no unit and no emulator,
// runs with no arguments from the checkout root (python3 -B FILE), and skips with unittest.skipUnless when a tool it needs is
// missing. Scripts that drive an emulator or a unit take another name, such as emulator_test.py. sdk:check runs every listed
// module's host tests on each pull request, so a change to the shared SDK that breaks one fails itself; module:doctor runs the
// module's own, a draft's too (docs/ADD_A_MODULE.md, Host tests).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { moduleFolders } from './machine-folders.mjs'

const python = process.platform === 'win32' ? 'python' : 'python3'

/** The host tests under `folder` (relative to `root`), as paths relative to `root`, sorted. */
export function moduleTestFiles(root, folder) {
  const found = [], walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name === 'node_modules') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/^test_.*\.py$/.test(entry.name)) found.push(relative(root, path).split('\\').join('/'))
    }
  }
  if (existsSync(join(root, folder))) walk(join(root, folder))
  return found.sort()
}

/** Every listed module's host tests, on every machine with a module folder (drafts are left to module:doctor). */
export function listedModuleTests(root) {
  return moduleFolders().flatMap(machine => {
    const modules = join(root, 'sdk', machine, 'modules')
    if (!existsSync(modules)) return []
    return readdirSync(modules, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .flatMap(entry => moduleTestFiles(root, `sdk/${machine}/modules/${entry.name}`))
  })
}

/** How to run one host test, for sdk:check's job list and for runModuleTests. */
export const moduleTestCommand = file => ({ command: python, args: ['-X', 'utf8', '-B', file, '-v'], env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' } })

/** Run `files` one after another: { file, ok, detail }, `detail` the last lines of a failure's output. */
export function runModuleTests(root, files, timeout = 120_000) {
  return files.map(file => {
    const { command, args, env } = moduleTestCommand(file)
    const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout, env: { ...process.env, ...env } })
    const output = ((run.stdout ?? '') + (run.stderr ?? '')).trim().split('\n').filter(Boolean)
    // The exception or compiler error says the most; unittest's closing FAILED line says the least.
    const why = run.error ? run.error.message : output.findLast(line => /^\s*\w*(Error|Exception)\b|error:/.test(line)) ?? output.findLast(line => /^FAIL:/.test(line)) ?? output.at(-1) ?? 'exit ' + run.status
    return { file, ok: run.status === 0, detail: run.status === 0 ? '' : why.trim().slice(0, 200) }
  })
}
