import { describe, expect, it } from 'vitest'
import { asanToolchain, COMMAND_LINE_TOOLS } from './asan-preflight.mjs'

/** A probe that answers per toolchain: the selected tools (no DEVELOPER_DIR) or the Command Line Tools. */
const probe = (selected, tools) => env => env.DEVELOPER_DIR === COMMAND_LINE_TOOLS ? tools : selected

describe('sdk:check\'s AddressSanitizer check', () => {
  it('changes nothing off macOS or when the selected tools run ASan programs', () => {
    expect(asanToolchain({ platform: 'linux', probe: () => { throw new Error('must not probe') } })).toEqual({ env: {} })
    expect(asanToolchain({ platform: 'darwin', env: {}, probe: probe('ok', 'hang'), exists: () => true })).toEqual({ env: {} })
  })

  it('uses the Command Line Tools when the selected ones hang and those work, and says how to make it the default', () => {
    const result = asanToolchain({ platform: 'darwin', env: {}, probe: probe('hang', 'ok'), exists: () => true })
    expect(result.env).toEqual({ DEVELOPER_DIR: COMMAND_LINE_TOOLS })
    expect(result.note).toContain('hang at start')
    expect(result.note).toContain('sudo xcode-select -s ' + COMMAND_LINE_TOOLS)
  })

  it('stops at once with the fix when nothing here runs them', () => {
    expect(() => asanToolchain({ platform: 'darwin', env: {}, probe: probe('hang', 'hang'), exists: () => true })).toThrow(/did not run them either: update them/)
    expect(() => asanToolchain({ platform: 'darwin', env: {}, probe: probe('fail', 'ok'), exists: () => false })).toThrow(/do not build or run.*xcode-select --install/)
    // A developer who chose tools on purpose keeps them: no silent switch, the error says what failed.
    expect(() => asanToolchain({ platform: 'darwin', env: { DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' }, probe: probe('hang', 'ok'), exists: () => true })).toThrow(/hang at start/)
  })
})
