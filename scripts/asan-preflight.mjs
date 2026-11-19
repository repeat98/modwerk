// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// sdk:check's host C tests run under AddressSanitizer. On macOS, with Xcode 16.4's clang every ASan program hangs before
// main (docs/DEVELOPER_WORKFLOW.md, "Your development setup"), and sdk:check then never finishes: a new developer waited
// 25 minutes on pr:ready before their agent found out why (19 November 2026). This checks once, before any job, with a
// time limit: when the selected tools hang or fail and the Command Line Tools work, the jobs use those (DEVELOPER_WORKFLOW);
// when neither works, sdk:check stops at once and says what to do.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const COMMAND_LINE_TOOLS = '/Library/Developer/CommandLineTools'

/** Builds and runs an empty ASan program with the tools `env` selects: 'ok', 'hang' or 'fail'. */
export function probeAsan(env = process.env, { compileSeconds = 120, runSeconds = 20 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'modwerk-asan-'))
  try {
    writeFileSync(join(dir, 'probe.c'), 'int main(void) { return 0; }\n')
    const build = spawnSync('cc', ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-o', join(dir, 'probe'), join(dir, 'probe.c')], { env, timeout: compileSeconds * 1000, stdio: 'ignore' })
    if (build.error?.code === 'ETIMEDOUT') return 'hang'
    if (build.status !== 0) return 'fail'
    const run = spawnSync(join(dir, 'probe'), [], { env, timeout: runSeconds * 1000, stdio: 'ignore' })
    return run.error?.code === 'ETIMEDOUT' ? 'hang' : run.status === 0 ? 'ok' : 'fail'
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** The environment sdk:check's jobs add, and a note for the log; throws with the fix when no tools here run ASan programs.
 * Only macOS is checked: Linux and CI compilers run them. */
export function asanToolchain({ platform = process.platform, env = process.env, probe = probeAsan, exists = existsSync } = {}) {
  if (platform !== 'darwin') return { env: {} }
  const selected = probe(env)
  if (selected === 'ok') return { env: {} }
  const what = selected === 'hang' ? 'hang at start' : 'do not build or run'
  if (!env.DEVELOPER_DIR && exists(COMMAND_LINE_TOOLS) && probe({ ...env, DEVELOPER_DIR: COMMAND_LINE_TOOLS }) === 'ok')
    return { env: { DEVELOPER_DIR: COMMAND_LINE_TOOLS }, note: `AddressSanitizer programs built with the selected developer tools ${what}; sdk:check uses the Command Line Tools (${COMMAND_LINE_TOOLS}) instead. To make that the default, run in Terminal: sudo xcode-select -s ${COMMAND_LINE_TOOLS}` }
  throw new Error(`AddressSanitizer programs built with this Mac's developer tools ${what}, so sdk:check's host C tests cannot run. ` +
    (exists(COMMAND_LINE_TOOLS) ? `The Command Line Tools did not run them either: update them (softwareupdate --list) or Xcode, then run this again.` : `Install the Command Line Tools (xcode-select --install), then run this again.`) +
    ' (docs/DEVELOPER_WORKFLOW.md, "Your development setup")')
}
