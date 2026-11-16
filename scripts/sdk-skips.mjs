/** The tests an SDK job skipped, each with its reason, and which reasons only want a compiler, assembler or binutils. */
// The pinned image (sdk/build/Dockerfile) has these, so CI's sdk-toolchain job refuses a skip for them. A Swift skip is no C compiler.
const TOOLCHAIN = /ColdFire|m68k|dsp_asm|DSP (?:host\/)?assembler|binutils|toolchain|dsp56300|\bC compiler|(?:host|native|cross) compiler/i
// What the image or CI never has, also where a reason names a tool beside it: stock firmware, an upstream checkout, Unicorn, the
// built emulator and the DSP host. These stay listed skips.
const BEYOND = /firmware|stock MAIN|checkout|Unicorn|emulator|DSP host/i
export const toolchainSkip = reason => TOOLCHAIN.test(reason) && !BEYOND.test(reason)

/** unittest -v writes `<test> ... skipped 'reason'`; its summary counts them. A job that runs unittest itself counts last. */
export function skipsOf(text) {
  const reasons = [...text.matchAll(/ \.\.\. skipped (['"])(.*)\1\r?$/gm)].map(match => match[2])
  const counted = Number([...text.matchAll(/^(?:OK|FAILED) \((?:.*, )?skipped=(\d+)/gm)].at(-1)?.[1] ?? 0)
  return [...reasons, ...Array(Math.max(0, counted - reasons.length)).fill('(reason not printed)')]
}

/** Skips by reason, most first, each with the jobs that skipped for it; `toolchain` counts the toolchain skips. */
export function skipReport(skips, tests) {
  const reasons = new Map()
  for (const { job, reason } of skips) {
    const entry = reasons.get(reason) ?? reasons.set(reason, { count: 0, jobs: new Set() }).get(reason)
    entry.count++
    entry.jobs.add(job)
  }
  const toolchain = skips.filter(skip => toolchainSkip(skip.reason)).length
  const lines = [...reasons].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([reason, entry]) =>
    `  ${String(entry.count).padStart(3)}  ${toolchainSkip(reason) ? '[toolchain] ' : ''}${reason}: ${[...entry.jobs].sort().join(', ')}`)
  const summary = `SDK skips: ${skips.length} of ${tests} tests, ${toolchain} for a missing toolchain`
  return { toolchain, summary, lines: skips.length ? [summary, ...lines] : [] }
}
