// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Prints how the maintenance bot's model run ended, without any of its text: the job log is public
// (docs/MAINTENANCE_BOT.md). Exits non-zero when the run did not finish cleanly.
import { readFileSync } from 'node:fs'

export function modelStatus(raw) {
  let run
  try { run = JSON.parse(raw) } catch { return { line: 'The model printed no result (' + raw.length + ' bytes, not shown).', ok: false } }
  const usage = run.usage ?? {}, n = value => Number(value ?? 0).toLocaleString('en')
  const line = 'Model run: ' + (run.subtype ?? 'unknown') + (run.is_error ? ' (error)' : '') + ', ' + n(run.num_turns) + ' turns, ' + Math.round(Number(run.duration_ms ?? 0) / 1000) + ' s; tokens: '
    + n(usage.input_tokens) + ' in, ' + n(usage.cache_read_input_tokens) + ' cache read, ' + n(usage.cache_creation_input_tokens) + ' cache write, ' + n(usage.output_tokens) + ' out.'
  return { line, ok: run.subtype === 'success' && !run.is_error }
}

if (import.meta.url === 'file://' + process.argv[1]) {
  let raw
  try { raw = readFileSync(process.argv[2], 'utf8') } catch { raw = '' }
  const { line, ok } = modelStatus(raw)
  console.log(line)
  if (!ok) process.exitCode = 1
}
