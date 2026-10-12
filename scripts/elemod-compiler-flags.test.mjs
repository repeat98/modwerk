import { test, expect } from 'vitest'
import { validateCompilerFlags } from './elemod-compiler-flags.mjs'
test('allows reviewed firmware options and refuses compiler execution/path escape options', () => {
 const flags = ['-msoft-float','-fno-common','-fno-asynchronous-unwind-tables','-Wall','-Wextra','-Werror','-Os','-DDT_OS154=1','-std=c99']
 expect(validateCompilerFlags(flags)).toEqual(flags)
 for (const flag of ['@args','-fplugin=/tmp/plugin.so','-B/tmp','-include/tmp/x','-I/tmp','-DNAME=$(id)','-m68000','-Wl,-T/tmp/x']) expect(() => validateCompilerFlags([flag])).toThrow('Unsupported')
})
