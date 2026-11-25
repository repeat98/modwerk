import { describe, expect, it } from 'vitest'
import { formatProcesses, formatReview, heavyProcesses, readCalls, reviewSession } from './agent-session-review.mjs'

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

  it('finds what the developer corrected, interrupted and refused', () => {
    const refused = { type: 'user', timestamp: at(30), message: { content: [{ type: 'tool_result', tool_use_id: 'b', content: "The user doesn't want to proceed with this tool use.", is_error: true }] } }
    const review = reviewSession(readCalls(claude([
      prompt('Build the reverb page', 0),
      use('a', 'Bash', { command: 'npm run check' }, 5), result('a', 20),
      prompt([{ type: 'text', text: '[Request interrupted by user]' }], 21),
      prompt('No, the menu row, I said that already', 22),
      use('b', 'Bash', { command: 'git push --force' }, 25), refused,
      prompt('Warum dauert das so lange?', 40),
      prompt('Reply to this <pasted_content id="a1">it still doesn\'t work!</pasted_content>', 50),
    ])))
    expect(review).toMatchObject({ prompts: 4, interrupts: 1 })
    expect(review.denied.map(call => call.label)).toEqual(['Bash: git push --force'])
    expect(review.friction.map(said => said.text)).toEqual(['No, the menu row, I said that already', 'Warum dauert das so lange?'])
    const text = formatReview(review).join('\n')
    expect(text).toContain('stopped the agent 1 times and refused 1 tool calls')
    expect(text).toContain('> No, the menu row, I said that already')
    expect(text).not.toContain('Build the reverb page')
  })

  it('lists development processes that cost much processor time', () => {
    const rows = heavyProcesses([
      '  812  98.1  79:12.40    01:55:49 /Users/x/.vscode/extensions/ms-vscode.cpptools-1.35.6/bin/cpptools',
      '  901   2.0 1-02:00:00 2-00:00:00 /System/Library/WindowServer -daemon',
      '  77   60.0   0:03.00       00:05 node /work/modwerk/node_modules/.bin/vitest run',
      '  78    0.0   0:30.00    10:00 node scripts/agent-board.mjs',
      'garbage',
    ].join('\n'))
    expect(rows.map(row => [row.pid, row.seconds])).toEqual([[812, 4752.4], [77, 3]])
    expect(formatProcesses(rows).join('\n')).toContain('79.2 min   98.1 % now, up 01:55:49  pid 812')
  })

  it('says so when a session ran no tools', () => {
    expect(formatReview(reviewSession(readCalls(claude([prompt('Hello', 0)]))))).toEqual(['Session: 0 min from first to last entry (time away included), 1 prompts from the developer.', 'Tools: 0 calls, 0.0 s of wall time, 0 failed.'])
  })
})
