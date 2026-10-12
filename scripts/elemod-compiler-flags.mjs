// SPDX-License-Identifier: GPL-3.0-or-later
// No paths, response files, plugins or arbitrary toolchain options.
export function validateCompilerFlags(flags) {
  const exact = new Set(['-msoft-float', '-fno-common', '-fno-asynchronous-unwind-tables', '-Wall', '-Wextra', '-Werror'])
  if (flags.some(flag => !exact.has(flag) && !/^(-D[A-Za-z_][A-Za-z0-9_]*(=[A-Za-z0-9_+.-]+)?|-O[0-3sg]|-std=(gnu|c)(99|11|17|23)|-fno-(builtin|pic|pie|omit-frame-pointer))$/.test(flag))) throw new Error('Unsupported compiler flag')
  return flags
}
