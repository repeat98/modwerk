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
const INTERRUPT = /^\s*\[Request interrupted by user/
const DENIED = /^\s*The user doesn't want to proceed with this tool use/
/** What a developer writes when the agent got something wrong or had to be told twice (English and German). The agent
 * reads each match and judges it; a false match costs a line. */
const FRICTION = /^\s*(?:no|nope|nein|stop|wait|halt|wrong|falsch)\b|\b(?:again|I said|I told you|already (?:said|told)|not what I|that's not|doesn't work|does not work|didn't work|still (?:broken|not|doesn't|fails|failing|red|wrong)|why (?:did|do|didn't|don't|are|is) you|you (?:forgot|missed|ignored)|too (?:slow|long)|takes? (?:\w+ )?(?:so|too) long|why (?:\w+ )*so (?:long|slow)|wtf|ffs|nochmal|schon wieder|immer noch|funktioniert nicht|geht nicht|warum (?:hast|machst|ist)|dauert (?:\w+ )?(?:zu|so) lange)\b|\?!/i

/** Every tool call of one transcript in order: `{ tool, label, start, seconds, failed }`, `seconds` null while it has no
 * result. Subagent turns are left out, as in a shared session. */
export function readCalls(lines, agent = 'claude-code') {
  const calls = [], open = new Map(), said = []
  let prompts = 0, interrupts = 0, first = null, last = null
  const begin = (id, tool, input, at) => { const call = { tool, label: describeTool(tool, input), start: at, seconds: null, failed: false }; calls.push(call); open.set(id, call) }
  const end = (id, at, failed, denied = false) => {
    const call = open.get(id)
    if (!call) return
    if (call.start !== null && at !== null) call.seconds = Math.max(0, (at - call.start) / 1000)
    if (failed) call.failed = true
    if (denied) call.denied = true
  }
  // Pasted text is someone else's words (a tester's message, a log): only the developer's own count as friction.
  const human = (text, at) => { if (INTERRUPT.test(text)) interrupts++; else { prompts++; said.push({ at, text: text.replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g, '[pasted]').trim() }) } }
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
        if (text.trim() && !/^\s*(?:<environment_context>|<user_instructions>|# AGENTS\.md instructions)/.test(text)) human(text, at)
      }
      continue
    }
    if ((row.type !== 'user' && row.type !== 'assistant') || row.isSidechain === true || !record(row.message)) continue
    if (at !== null) { first ??= at; last = at }
    const content = row.message.content, blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content.filter(record) : []
    if (row.type === 'assistant') { for (const block of blocks) if (block.type === 'tool_use') begin(str(block.id), str(block.name), block.input, at); continue }
    let result = false
    for (const block of blocks) if (block.type === 'tool_result') {
      result = true
      const output = typeof block.content === 'string' ? block.content : Array.isArray(block.content) ? block.content.filter(record).map(part => str(part.text)).join('\n') : ''
      end(str(block.tool_use_id), at, block.is_error === true, block.is_error === true && DENIED.test(output))
    }
    const text = blocks.filter(block => block.type === 'text').map(block => str(block.text)).join('\n')
    if (!result && (!record(row.origin) || row.origin.kind === 'human') && row.isMeta !== true && row.isCompactSummary !== true && row.isVisibleInTranscriptOnly !== true && text.trim()) human(text, at)
  }
  return { calls, prompts, interrupts, said, minutes: first !== null && last !== null ? (last - first) / 60000 : 0 }
}

const sum = list => list.reduce((total, call) => total + (call.seconds ?? 0), 0)

/** The figures of a session: where the time went, what failed, and what was done over and over. */
export function reviewSession({ calls, prompts, minutes, interrupts = 0, said = [] }, top = 10) {
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
    interrupts, denied: work.filter(call => call.denied),
    friction: said.filter(prompt => FRICTION.test(prompt.text)),
  }
}

/** Processes still on the computer that cost much processor time, from `ps -Ao pid=,pcpu=,time=,etime=,command=`:
 * a transcript holds none, so this is where the review sees an editor indexing worktrees or an emulator left running. */
const DEVELOPMENT = /modwerk|\bnode\b|vitest|esbuild|\btsc\b|python|\bmake\b|clang|\bcc1|_emu\b|emu\b|wrangler|workerd|cpptools|Code Helper|\/mds|\bgit\b|claude|codex/i
const cpuSeconds = value => { const [days, clock] = value.includes('-') ? value.split('-') : ['0', value]; return Number(days) * 86400 + clock.split(':').reduce((total, part) => total * 60 + Number(part), 0) }
export function heavyProcesses(ps, top = 8) {
  return ps.split('\n').map(line => line.trim().match(/^(\d+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.+)$/)).filter(Boolean)
    .map(([, pid, percent, cpu, elapsed, command]) => ({ pid: Number(pid), percent: Number(percent), seconds: cpuSeconds(cpu), elapsed, command }))
    .filter(row => Number.isFinite(row.seconds) && DEVELOPMENT.test(row.command) && (row.seconds >= 120 || row.percent >= 50))
    .sort((a, b) => b.seconds - a.seconds).slice(0, top)
}
export function formatProcesses(rows) {
  if (!rows.length) return []
  return ['', 'Processor time now, development processes (since each started):',
    ...rows.map(row => `  ${span(row.seconds).padStart(9)}  ${String(row.percent).padStart(5)} % now, up ${row.elapsed}  pid ${row.pid}  ${cut(row.command, 120)}`)]
}

const span = seconds => seconds >= 90 ? (seconds / 60).toFixed(1) + ' min' : seconds.toFixed(1) + ' s'
const cut = (text, limit = 110) => text.length > limit ? text.slice(0, limit - 1) + '…' : text

/** The review as the lines the agent reads, ending with what the figures cannot show. */
export function formatReview(review, processes = []) {
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
  if (review.interrupts || review.denied?.length) lines.push('', `The developer stopped the agent ${review.interrupts ?? 0} times and refused ${review.denied?.length ?? 0} tool calls:`, ...(review.denied ?? []).slice(0, 10).map(call => '  refused: ' + cut(call.label)))
  if (review.friction?.length) lines.push('', `What the developer said that reads like a correction or frustration (${review.friction.length}; judge each, it stays here):`, ...review.friction.slice(0, 15).map(prompt => '  > ' + cut(prompt.text.replace(/\s+/g, ' '), 160)))
  lines.push(...formatProcesses(processes))
  lines.push('', 'The figures are wall time; a transcript holds no processor time. They cannot show where you guessed and were wrong,',
    'which guide or check sent you the wrong way or said nothing, and why the developer corrected you: add those yourself (/modwerk-post-eval).',
    'Then tell the developer at most three findings, each with its fix (docs/AGENT_SESSIONS.md#review-the-session-first).')
  return lines
}
