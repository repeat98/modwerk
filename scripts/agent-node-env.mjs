#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Claude Code's SessionStart hook (.claude/settings.json): an agent's shell starts on the computer's default Node, and an
// older one fails every npm script on its .ts imports, so agents prefixed nvm to their commands by hand. This puts the
// newest installed nvm Node of .nvmrc's major first on PATH for the session's Bash commands ($CLAUDE_ENV_FILE), or says
// which Node to install. Plain JavaScript, no .ts import: it runs on the old Node it replaces.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const parts = version => String(version).replace(/^v/, '').split('.').map(Number)

/** The bin folder to put first, null when the running Node already fits, or undefined when none installed fits. */
export function nodeBin({ wanted, current, installed, nvmDir }) {
  if (parts(current)[0] >= wanted) return null
  const fits = installed.filter(version => parts(version)[0] === wanted)
    .sort((a, b) => { const x = parts(a), y = parts(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] })
  return fits.length ? join(nvmDir, 'versions', 'node', fits[0], 'bin') : undefined
}

export function main(env = process.env) {
  const root = env.CLAUDE_PROJECT_DIR || process.cwd()
  let wanted
  try { wanted = parts(readFileSync(join(root, '.nvmrc'), 'utf8').trim())[0] } catch { return 0 }
  if (!Number.isInteger(wanted)) return 0
  const nvmDir = env.NVM_DIR || join(homedir(), '.nvm')
  let installed = []
  try { installed = readdirSync(join(nvmDir, 'versions', 'node')) } catch { /* no nvm: the message below says what to install */ }
  const bin = nodeBin({ wanted, current: process.versions.node, installed, nvmDir })
  if (bin === null) return 0
  if (bin && env.CLAUDE_ENV_FILE) {
    appendFileSync(env.CLAUDE_ENV_FILE, `export PATH="${bin}:$PATH"\n`)
    console.log(`Node ${process.versions.node} was first on PATH; this session's shell commands use ${bin} (.nvmrc wants ${wanted}).`)
  } else console.log(`This shell has Node ${process.versions.node}; Modwerk needs Node ${wanted} (.nvmrc). Install it (nvm install ${wanted}) and start a new session, or run npm commands after nvm use.`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main()
