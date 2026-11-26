// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Prints how the maintenance bot's model run ended, without any of its text: the job log is public
// (docs/MAINTENANCE_BOT.md). Adds the run's schema-checked proposals to the file given second, each action marked
// with the lane given third, and exits non-zero when the run did not finish cleanly or returned none.
import { readFileSync, writeFileSync } from 'node:fs'

export function modelStatus(raw) {
  let run
  try { run = JSON.parse(raw) } catch { return { line: 'The model printed no result (' + raw.length + ' bytes, not shown).', ok: false } }
  const usage = run.usage ?? {}, n = value => Number(value ?? 0).toLocaleString('en')
  const line = 'Model run: ' + (run.subtype ?? 'unknown') + (run.is_error ? ' (error)' : '') + ', ' + n(run.num_turns) + ' turns, ' + Math.round(Number(run.duration_ms ?? 0) / 1000) + ' s; tokens: '
    + n(usage.input_tokens) + ' in, ' + n(usage.cache_read_input_tokens) + ' cache read, ' + n(usage.cache_creation_input_tokens) + ' cache write, ' + n(usage.output_tokens) + ' out.'
  const proposals = run.structured_output, returned = proposals !== null && typeof proposals === 'object'
  return { line: line + (returned ? '' : ' No proposals returned.'), ok: run.subtype === 'success' && !run.is_error && returned, proposals }
}

/** Only the three lists are taken from the model's answer; the lane mark is what the executor trusts. */
export function addLane(all, proposals, lane) {
  const merged = { ...all }
  for (const key of ['actions', 'todos', 'drop']) merged[key] = [...(Array.isArray(all?.[key]) ? all[key] : []), ...(Array.isArray(proposals[key]) ? proposals[key] : []).map(item => key === 'actions' && item && typeof item === 'object' ? { ...item, lane } : item)]
  return merged
}
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} } }

if (import.meta.url === 'file://' + process.argv[1]) {
  let raw
  try { raw = readFileSync(process.argv[2], 'utf8') } catch { raw = '' }
  const { line, ok, proposals } = modelStatus(raw), lane = process.argv[4] ?? ''
  console.log((lane ? lane + ' lane. ' : '') + line)
  if (ok) writeFileSync(process.argv[3], JSON.stringify(addLane(readJson(process.argv[3]), proposals, lane)))
  else process.exitCode = 1
}
