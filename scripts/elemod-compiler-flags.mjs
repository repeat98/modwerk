// SPDX-License-Identifier: GPL-3.0-or-later
// No paths, response files, plugins or arbitrary toolchain options.
export function validateCompilerFlags(flags) {
  // -fno-late-combine-instructions: a module whose C trips sdk/runtime/m68k_codegen.py turns GCC 16.2's pass off for itself only;
  // setting it for every build would change the bytes of released packages.
  const exact = new Set(['-msoft-float', '-fno-common', '-fno-asynchronous-unwind-tables', '-fno-late-combine-instructions', '-Wall', '-Wextra', '-Werror'])
  if (flags.some(flag => !exact.has(flag) && !/^(-D[A-Za-z_][A-Za-z0-9_]*(=[A-Za-z0-9_+.-]+)?|-O[0-3sg]|-std=(gnu|c)(99|11|17|23)|-fno-(builtin|pic|pie|omit-frame-pointer|tree-loop-distribute-patterns)|-W(missing|strict)-prototypes|-Wno-error=incompatible-pointer-types)$/.test(flag))) throw new Error('Unsupported compiler flag')
  return flags
}
