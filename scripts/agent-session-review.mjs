// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Where a coding-agent session spent its time, read from its transcript (docs/AGENT_SESSIONS.md#review-the-session-first).
// Nothing leaves the computer: `npm run session -- review` prints this for the agent that is about to finish.
// A transcript holds no processor time, so every figure is the wall time between a tool call and its result,
// which includes waiting for the developer to allow it.
import { describeTool } from '../src/community/agent-sessions.ts'

const record = value => !!value && typeof value === 'object' && !Array.isArray(value)
const str = value => typeof value === 'string' ? value : ''
const time = value => { const at = Date.parse(str(value)); return Number.isFinite(at) ? at : null }
/** Tools that wait for the developer's answer: their time is the developer's, not the tool's. */
const QUESTIONS = new Set(['AskUserQuestion', 'ExitPlanMode', 'request_user_input'])
const CODEX_FAILED = /"exit_code"\s*:\s*[1-9]|Process exited with code [1-9]|exit code:? [1-9]/i

/** Every tool call of one transcript in order: `{ tool, label, start, seconds, failed }`, `seconds` null while it has no
 * result. Subagent turns are left out, as in a shared session. */
export function readCalls(lines, agent = 'claude-code') {
  const calls = [], open = new Map()
  let prompts = 0, first = null, last = null
  const begin = (id, tool, input, at) => { const call = { tool, label: describeTool(tool, input), start: at, seconds: null, failed: false }; calls.push(call); open.set(id, call) }
  const end = (id, at, failed) => {
    const call = open.get(id)
    if (!call) return
    if (call.start !== null && at !== null) call.seconds = Math.max(0, (at - call.start) / 1000)
    if (failed) call.failed = true
  }
  for (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (!record(row)) continue
    const at = time(row.timestamp)
    if (agent === 'codex') {
      const item = row.payload
      if (row.type !== 'response_item' || !record(item)) continue
      if (at !== null) { first ??= at; last = at }
      if (item.type === 'function_call' || item.type === 'custom_tool_call' || item.type === 'local_shell_call') {
        let input = item.input ?? item.action
        if (typeof item.arguments === 'string') { try { input = JSON.parse(item.arguments) } catch { input = {} } }
        begin(str(item.call_id), str(item.name) || 'shell', item.type === 'custom_tool_call' ? {} : input, at)
      } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
        end(str(item.call_id), at, CODEX_FAILED.test(typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? '')))
      } else if (item.type === 'message' && item.role === 'user') {
        const text = (Array.isArray(item.content) ? item.content.filter(record) : []).map(part => str(part.text)).join('\n')
        if (text.trim() && !/^\s*(?:<environment_context>|<user_instructions>|# AGENTS\.md instructions)/.test(text)) prompts++
      }
      continue
    }
    if ((row.type !== 'user' && row.type !== 'assistant') || row.isSidechain === true || !record(row.message)) continue
    if (at !== null) { first ??= at; last = at }
    const content = row.message.content, blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content.filter(record) : []
    if (row.type === 'assistant') { for (const block of blocks) if (block.type === 'tool_use') begin(str(block.id), str(block.name), block.input, at); continue }
    let result = false
    for (const block of blocks) if (block.type === 'tool_result') { result = true; end(str(block.tool_use_id), at, block.is_error === true) }
    const human = !record(row.origin) || row.origin.kind === 'human'
    if (!result && human && row.isMeta !== true && row.isCompactSummary !== true && row.isVisibleInTranscriptOnly !== true && blocks.some(block => block.type === 'text' && str(block.text).trim())) prompts++
  }
  return { calls, prompts, minutes: first !== null && last !== null ? (last - first) / 60000 : 0 }
}

const sum = list => list.reduce((total, call) => total + (call.seconds ?? 0), 0)

/** The figures of a session: where the time went, what failed, and what was done over and over. */
export function reviewSession({ calls, prompts, minutes }, top = 10) {
  const questions = calls.filter(call => QUESTIONS.has(call.tool)), work = calls.filter(call => !QUESTIONS.has(call.tool))
  const tools = new Map(), labels = new Map()
  for (const call of work) {
    const row = tools.get(call.tool) ?? { tool: call.tool, calls: 0, seconds: 0, failed: 0 }
    row.calls++; row.seconds += call.seconds ?? 0; if (call.failed) row.failed++
    tools.set(call.tool, row)
    labels.set(call.label, (labels.get(call.label) ?? 0) + 1)
  }
  return {
    minutes, prompts, calls: work.length, seconds: sum(work),
    questions: questions.length, questionSeconds: sum(questions),
    byTool: [...tools.values()].sort((a, b) => b.seconds - a.seconds),
    slowest: work.filter(call => call.seconds !== null).sort((a, b) => b.seconds - a.seconds).slice(0, top),
    failed: work.filter(call => call.failed),
    repeated: [...labels].filter(([, times]) => times >= 3).sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, times]) => ({ label, times })),
  }
}

const span = seconds => seconds >= 90 ? (seconds / 60).toFixed(1) + ' min' : seconds.toFixed(1) + ' s'
const cut = (text, limit = 110) => text.length > limit ? text.slice(0, limit - 1) + '…' : text

/** The review as the lines the agent reads, ending with what the figures cannot show. */
export function formatReview(review) {
  const lines = [
    `Session: ${review.minutes.toFixed(0)} min from first to last entry (time away included), ${review.prompts} prompts from the developer.`,
    `Tools: ${review.calls} calls, ${span(review.seconds)} of wall time, ${review.failed.length} failed.`,
  ]
  if (review.questions) lines.push(`Questions to the developer: ${review.questions}, ${span(review.questionSeconds)} until answered (not counted as tool time).`)
  if (!review.calls) return lines
  lines.push('', 'By tool:', ...review.byTool.map(row => `  ${span(row.seconds).padStart(9)}  ${String(row.calls).padStart(4)} calls  ${row.tool}${row.failed ? `  (${row.failed} failed)` : ''}`))
  lines.push('', 'Slowest calls:', ...review.slowest.map(call => `  ${span(call.seconds).padStart(9)}  ${cut(call.label)}`))
  if (review.failed.length) lines.push('', `Failed calls (${review.failed.length}):`, ...review.failed.slice(0, 25).map(call => '  ' + cut(call.label)))
  if (review.repeated.length) lines.push('', 'Run three times or more:', ...review.repeated.map(row => `  ${String(row.times).padStart(3)}×  ${cut(row.label)}`))
  lines.push('', 'The figures are wall time; a transcript holds no processor time. They cannot show where you guessed and were wrong,',
    'which guide or check sent you the wrong way or said nothing, and what the developer had to correct or say twice: add those yourself.',
    'Then tell the developer at most three findings, each with its fix (docs/AGENT_SESSIONS.md#review-the-session-first).')
  return lines
}
