import { describe, expect, it } from 'vitest'
import { skipReport, skipsOf, toolchainSkip } from './sdk-skips.mjs'

// Lines as the Linux runner printed them for #1597 (run 43843149002, module-suites (sdk)).
const units = `test_a_raising_package_asks_for_the_entry_by_index_and_may_take_the_tick (test_runtime_units.RuntimeUnits.test_a_raising_package_asks_for_the_entry_by_index_and_may_take_the_tick) ... skipped 'ColdFire binutils unavailable'
test_dependencies_external_sources_and_changed_table_guards_are_refused (test_runtime_units.RuntimeUnits.test_dependencies_external_sources_and_changed_table_guards_are_refused) ... skipped 'ColdFire binutils unavailable'
test_runtime_index_reads (test_runtime_units.RuntimeUnits.test_runtime_index_reads) ... ok

----------------------------------------------------------------------
Ran 3 tests in 0.001s

OK (skipped=2)
`
const engines = `test_placed_engine_runs_bit_exactly_as_the_resident_one (test_resident_engines.ResidentEngines.test_placed_engine_runs_bit_exactly_as_the_resident_one)
A COMPRESSOR taken off a track with MON on: MON fades out over sixteen blocks and the track's own audio comes ... skipped 'dsp_asm (ELEKLOADER_DSP_ASM) or a host C compiler unavailable'
setUpClass (test_beat_slicer_zero_cross.ZeroCrossCandidate) ... skipped 'Base source changed; review and refresh the proposal: build_core.py'
test_knob (test_knob_step.KnobStep.test_knob) ... skipped "explicit local stock MAIN required; never firmware in CI"

----------------------------------------------------------------------
Ran 2 tests in 0.002s

FAILED (failures=1, skipped=3)
`
// test_recipe.py ran without -v: only its count.
const quiet = '............s..........................\n----------------------------------------------------------------------\nRan 39 tests in 20.751s\n\nOK (skipped=1)\n'

describe('SDK skips', () => {
  it('reads every skip reason, a docstring line, setUpClass, either quote and Windows line ends', () => {
    expect(skipsOf(units)).toEqual(['ColdFire binutils unavailable', 'ColdFire binutils unavailable'])
    expect(skipsOf(engines)).toEqual(['dsp_asm (ELEKLOADER_DSP_ASM) or a host C compiler unavailable',
      'Base source changed; review and refresh the proposal: build_core.py',
      'explicit local stock MAIN required; never firmware in CI'])
    expect(skipsOf(units.replaceAll('\n', '\r\n'))).toEqual(skipsOf(units))
    expect(skipsOf('Ran 4 tests in 0.1s\n\nOK\n')).toEqual([])
  })

  it('keeps a skip whose reason was not printed', () => {
    expect(skipsOf(quiet)).toEqual(['(reason not printed)'])
  })

  it('tells a missing compiler, assembler or binutils from firmware, Windows, a checkout or a package', () => {
    for (const reason of ['ColdFire compiler unavailable', 'no ColdFire binutils', 'needs the m68k-elf toolchain (make setup)',
      'explicit native DSP assembler unavailable', 'ELEKLOADER_DSP_ASM is not set', 'vendored dsp56300 build unavailable',
      'no C compiler', 'Native C compiler unavailable', 'no host C compiler', 'host compiler unavailable', 'ColdFire cross compiler required',
      'the reviewed GCC 16 ColdFire compiler is unavailable', 'dsp_asm (ELEKLOADER_DSP_ASM) or a host C compiler unavailable',
      'native toolchain and reviewed FM runtime adapter required']) expect(toolchainSkip(reason), reason).toBe(true)
    // The last six name a tool beside what CI never has: the image has the tool, so the other part is what is missing there.
    for (const reason of ['explicit local stock MAIN required; never firmware in CI', 'Native Windows DACL regression',
      'Archived SPACE transport is not part of the grain-only base', 'Swift compiler is a native developer check',
      '(reason not printed)', 'Base source changed; review and refresh the proposal: build_core.py', 'needs the pinned upstream checkout',
      'needs m68k-elf binutils, the upstream checkout and dsp_asm', 'ColdFire binutils or Unicorn unavailable',
      'ColdFire compiler and built native emulator archives required', 'Explicit independent native DSP host/assembler unavailable',
      'ColdFire tools, the upstream checkout and the built native emulator required',
      'native binutils and pinned upstream checkout required']) expect(toolchainSkip(reason), reason).toBe(false)
  })

  it('groups the skips by reason, most first, and counts the toolchain ones', () => {
    const skips = [['test_runtime_units.py', units], ['test_resident_engines.py', engines], ['test_recipe.py', quiet]]
      .flatMap(([job, text]) => skipsOf(text).map(reason => ({ job, reason })))
    const report = skipReport(skips)
    expect(report.toolchain).toBe(3)
    expect(report.lines[0]).toBe('SDK skips: 6 skips, 3 for a missing toolchain')
    expect(report.lines[1]).toBe('    2  [toolchain] ColdFire binutils unavailable: test_runtime_units.py')
    expect(report.lines).toHaveLength(6)
    expect(report.lines.at(-1)).toContain('never firmware in CI: test_resident_engines.py')
    expect(skipReport([]).lines).toEqual([])
  })
})
