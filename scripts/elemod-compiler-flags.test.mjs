import { test, expect } from 'vitest'
import { validateCompilerFlags } from './elemod-compiler-flags.mjs'
test('allows reviewed firmware options and refuses compiler execution/path escape options', () => {
 const flags = ['-msoft-float','-fno-common','-fno-asynchronous-unwind-tables','-fno-late-combine-instructions','-Wall','-Wextra','-Werror','-Os','-DDT_OS154=1','-std=c99','-fno-tree-loop-distribute-patterns','-Wmissing-prototypes','-Wstrict-prototypes','-Wno-error=incompatible-pointer-types']
 expect(validateCompilerFlags(flags)).toEqual(flags)
 for (const flag of ['@args','-fplugin=/tmp/plugin.so','-B/tmp','-include/tmp/x','-I/tmp','-DNAME=$(id)','-m68000','-Wl,-T/tmp/x']) expect(() => validateCompilerFlags([flag])).toThrow('Unsupported')
})
