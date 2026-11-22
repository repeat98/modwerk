import { describe, expect, it } from 'vitest'
import { formatReview, readCalls, reviewSession } from './agent-session-review.mjs'

const at = seconds => new Date(Date.UTC(2026, 10, 20, 9, 0, seconds)).toISOString()
const claude = rows => rows.map(row => JSON.stringify(row))
const use = (id, name, input, seconds, extra = {}) => ({ type: 'assistant', timestamp: at(seconds), message: { content: [{ type: 'tool_use', id, name, input }] }, ...extra })
const result = (id, seconds, failed = false) => ({ type: 'user', timestamp: at(seconds), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'secret output', is_error: failed }] } })
const prompt = (text, seconds, extra = {}) => ({ type: 'user', timestamp: at(seconds), message: { content: text }, ...extra })

describe('session review', () => {
  it('times each Claude Code tool call from its request to its result', () => {
    const read = readCalls(claude([
      prompt('Fix the check', 0),
      use('a', 'Bash', { command: 'npm run check', description: 'Run the check' }, 10),
      result('a', 250, true),
      use('b', 'Read', { file_path: 'docs/SDK.md' }, 260),
      result('b', 261),
      prompt('injected', 262, { isMeta: true }),
      use('c', 'Bash', { command: 'sleep 9' }, 270, { isSidechain: true }),
      use('d', 'Bash', { command: 'never returns' }, 300),
    ]))
    expect(read.prompts).toBe(1)
    expect(read.minutes).toBe(5)
    expect(read.calls.map(call => [call.tool, call.seconds, call.failed])).toEqual([['Bash', 240, true], ['Read', 1, false], ['Bash', null, false]])
    expect(read.calls[0].label).toBe('Bash: Run the check · npm run check')
  })

  it('keeps the wait for the developer out of the tool time and finds what was repeated', () => {
    const rows = [use('q', 'AskUserQuestion', {}, 0), result('q', 600)]
    for (let index = 0; index < 3; index++) rows.push(use('r' + index, 'Bash', { command: 'npm run pr:ready' }, 700 + index * 100), result('r' + index, 760 + index * 100, index === 0))
    const review = reviewSession(readCalls(claude(rows)))
    expect(review).toMatchObject({ calls: 3, seconds: 180, questions: 1, questionSeconds: 600 })
    expect(review.byTool).toEqual([{ tool: 'Bash', calls: 3, seconds: 180, failed: 1 }])
    expect(review.repeated).toEqual([{ label: 'Bash: npm run pr:ready', times: 3 }])
    const text = formatReview(review).join('\n')
    expect(text).toContain('Tools: 3 calls, 3.0 min of wall time, 1 failed.')
    expect(text).toContain('Questions to the developer: 1, 10.0 min until answered')
    expect(text).toContain('3×  Bash: npm run pr:ready')
    expect(text).not.toContain('secret output')
  })

  it('reads a Codex rollout', () => {
    const row = (seconds, payload) => JSON.stringify({ type: 'response_item', timestamp: at(seconds), payload })
    const read = readCalls([
      JSON.stringify({ type: 'session_meta', timestamp: at(0), payload: { cwd: '/work' } }),
      row(1, { type: 'message', role: 'user', content: [{ text: '<environment_context>…' }] }),
      row(2, { type: 'message', role: 'user', content: [{ text: 'Build the module' }] }),
      row(5, { type: 'function_call', name: 'shell', call_id: 'x', arguments: JSON.stringify({ command: ['make', 'all'] }) }),
      row(65, { type: 'function_call_output', call_id: 'x', output: '{"metadata":{"exit_code":2}}' }),
    ], 'codex')
    expect(read.prompts).toBe(1)
    expect(read.calls).toEqual([{ tool: 'shell', label: 'shell: make all', start: Date.parse(at(5)), seconds: 60, failed: true }])
  })

  it('says so when a session ran no tools', () => {
    expect(formatReview(reviewSession(readCalls(claude([prompt('Hello', 0)]))))).toEqual(['Session: 0 min from first to last entry (time away included), 1 prompts from the developer.', 'Tools: 0 calls, 0.0 s of wall time, 0 failed.'])
  })
})
