// The Octatrack base's self-test (PROJ > MODWERK > SELF TEST; sdk/machines/octatrack/elekloader/dsp.c), run by the site
// on a trial before it is kept, with the pattern playing and the effects' knobs moving: every module intact and
// running, never all at once but as many at a time as the ledger allows (no such combination may take a core or
// the CPU past 90 %), and a stress round. A module the Part's own effects crowd off a core runs on the other core, or
// on a core with those effects briefly taken off; it fails (bit 7) only when neither core holds it even then. About 3 s
// for every eight DSP modules.
import type { SelftestRecord } from './upload-usb.ts'

/** What each failed bit means, as the end of "The stress test failed: …". The order of selftest.h's bits. */
export const SELFTEST_FAILURES = [
  'a module didn’t install cleanly',
  'the modules couldn’t be loaded again while playing',
  'the Octatrack’s DSP stopped',
  'a combination the Octatrack allows overloads the DSP',
  'the module loader reported errors',
  'the test couldn’t put your tracks back as they were',
  'the test was stopped on the Octatrack',
  'a module doesn’t fit on either DSP core, even with the other effects there removed',
  'the Octatrack’s CPU went over 90 % while your pattern played with these modules; try syncing fewer at once',
  'a frame came late (something held the Octatrack’s interrupts too long)',
  'a module’s code on the DSP doesn’t match its package',
  'the key bus a module needs can’t start until the Octatrack restarts (turn it off and on, then sync again)',
] as const

/** After Keep: waits until the base says the running set is saved on the card and read back (true), or the save
 * failed or it took too long (false; the set still runs until the Octatrack is switched off). */
export async function waitUntilSaved(transport: SelftestTransport, options: { signal?: AbortSignal; pollMs?: number; timeoutMs?: number } = {}) {
  const { signal, pollMs = 500, timeoutMs = 20_000 } = options
  for (const start = Date.now(); Date.now() - start < timeoutMs; await wait(pollMs, signal)) {
    const record = await transport.selftest(false, signal)
    if (!record) return true // a base without the self-test cannot say; it saves as it did before
    if (record.saved === 7 && record.savedCount === record.live) return true
    if (record.saved === 8) return false
  }
  return false
}

export interface SelftestTransport { selftest(start: boolean, signal?: AbortSignal): Promise<SelftestRecord | undefined> }

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
})

/** Starts the test and waits for it: null when it passed, else why it failed (the first reason, in bit order). The
 * base refuses to start while a new module's DSP code is still being published, so starting is retried for `startMs`.
 * shortcut: a base without the self-test (it stalls the request) passes untested, as updates were before; refuse
 * those once every published base has it. */
export async function runSelftest(transport: SelftestTransport, options: { signal?: AbortSignal; pollMs?: number; timeoutMs?: number;
  startMs?: number; progress?: (done: number, total: number) => void; record?: (record: SelftestRecord) => void } = {}): Promise<string | null> {
  const { signal, pollMs = 500, timeoutMs = 180_000, startMs = 3000, progress } = options
  let record = await transport.selftest(true, signal)
  for (const start = Date.now(); record && record.state !== 1 && Date.now() - start < startMs;) {
    await wait(pollMs, signal)
    record = await transport.selftest(true, signal)
  }
  if (!record) return null
  options.record?.(record)
  if (record.state !== 1) return 'the Octatrack couldn’t start it; stop playback and try again'
  for (const start = Date.now(); record.state === 1; ) {
    progress?.(record.done, record.total)
    if (Date.now() - start > timeoutMs) return 'it took too long'
    await wait(pollMs, signal)
    const next = await transport.selftest(false, signal)
    if (!next) return 'the Octatrack stopped answering it'
    record = next
  }
  options.record?.(record)
  if (record.state === 2) return null
  const failed = record.failed
  const bit = SELFTEST_FAILURES.findIndex((_, i) => failed >> i & 1)
  return bit < 0 ? 'the Octatrack reported a failure' : explain(bit, record.culpritName)
}

/** The failure with the module that caused it, when the unit names one. */
export function explain(bit: number, module: string): string {
  if (!module) return SELFTEST_FAILURES[bit] ?? 'the Octatrack reported a failure'
  const named: Partial<Record<number, string>> = {
    0: `${module} didn’t install cleanly`,
    2: `the Octatrack’s DSP stopped with ${module} running`,
    3: `a combination the Octatrack allows overloads the DSP (with ${module})`,
    7: `${module} doesn’t fit on either DSP core, even with the other effects there removed`,
    // 8 (the CPU) names no module: the base blames the batch's dearest DSP effect, while the CPU is the pattern and every
    // module's ColdFire code together (a tester was told Mini Verb, then Tape Echo, for one heavy project; 24 October 2026).
    9: `a frame came late with ${module} running (something held the Octatrack’s interrupts too long)`,
    10: `${module}’s code on the DSP doesn’t match its package`,
  }
  return named[bit] ?? SELFTEST_FAILURES[bit] ?? 'the Octatrack reported a failure'
}
