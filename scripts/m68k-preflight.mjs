// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// sdk:check's ColdFire tests skip themselves when no m68k-elf-gcc is on PATH, which is how CI runs them. A computer where the
// compiler is found but part of its binutils is not (a folder of compiler shims ahead of the real toolchain) ran them all and
// failed about seven test files one by one, minutes into the check, each with a bare "No such file or directory:
// 'm68k-elf-readelf'". This says it once, before any job.
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Every m68k-elf tool the SDK suite, sdk/runtime/loader/build.py and the base builder start. */
export const M68K_TOOLS = ['gcc', 'as', 'ld', 'nm', 'objcopy', 'objdump', 'readelf']

const onPath = (tool, { env, exists, platform }) => (env.PATH ?? '').split(delimiter).filter(Boolean)
  .find(dir => exists(join(dir, tool)) || platform === 'win32' && exists(join(dir, tool + '.exe')))

/** Null when the ColdFire tools are all on PATH or the compiler is not (those tests skip); else what is missing and the fix. */
export function m68kToolchainProblem({ env = process.env, exists = existsSync, platform = process.platform } = {}) {
  const find = tool => onPath('m68k-elf-' + tool, { env, exists, platform })
  const compiler = find('gcc')
  if (!compiler) return null
  const missing = M68K_TOOLS.filter(tool => !find(tool)).map(tool => 'm68k-elf-' + tool)
  if (!missing.length) return null
  return `m68k-elf-gcc is on PATH (${compiler}) but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not, so every test that builds ColdFire code would fail. ` +
    'Put the folder of one complete m68k-elf toolchain (compiler and binutils) first on PATH and run this again; without m68k-elf-gcc on PATH those tests skip, as they do in CI.'
}
