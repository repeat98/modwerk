import { describe, expect, it } from 'vitest'
import { M68K_TOOLS, m68kToolchainProblem } from './m68k-preflight.mjs'

/** A PATH of two folders: `shims` holds the named tools, `full` holds every one when it is given. */
const computer = (shims, full = false) => ({
  env: { PATH: full ? '/shims:/full' : '/shims' }, platform: 'linux',
  exists: path => shims.some(tool => path === '/shims/m68k-elf-' + tool) || full && M68K_TOOLS.some(tool => path === '/full/m68k-elf-' + tool),
})

describe('sdk:check\'s ColdFire toolchain check', () => {
  it('says nothing without a compiler (the tests skip, as in CI) or with every tool', () => {
    expect(m68kToolchainProblem(computer([]))).toBeNull()
    expect(m68kToolchainProblem(computer(M68K_TOOLS))).toBeNull()
    // Shims for some tools ahead of a complete toolchain: each tool is found somewhere.
    expect(m68kToolchainProblem(computer(['gcc', 'ld'], true))).toBeNull()
  })

  it('names the missing tools and the fix when the compiler is found and part of its binutils is not', () => {
    const problem = m68kToolchainProblem(computer(['gcc', 'as', 'ld', 'nm', 'objcopy', 'objdump']))
    expect(problem).toContain('m68k-elf-gcc is on PATH (/shims) but m68k-elf-readelf is not')
    expect(problem).toContain('first on PATH')
    expect(m68kToolchainProblem(computer(['gcc']))).toContain('m68k-elf-as, m68k-elf-ld, m68k-elf-nm, m68k-elf-objcopy, m68k-elf-objdump, m68k-elf-readelf are not')
  })
})
