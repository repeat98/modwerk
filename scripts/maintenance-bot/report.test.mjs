import { describe, expect, it } from 'vitest'
import { dailyReport } from './report.mjs'

const row = (kind, status, tier = 'notify', extra = {}) => ({ kind, status, tier, summary: '#1 ' + kind, result: '', updated_at: 0, ...extra })

describe('maintenance bot report', () => {
  it('counts what was done and what waits, in a few lines', () => {
    const actions = [...Array(23).fill(row('label', 'done')), row('comment', 'done'), row('merge', 'pending', 'ask'), row('close', 'pending', 'window', { due_at: Date.parse('2026-11-17T09:30:00Z') / 1000 }), row('review', 'vetoed', 'window'), row('comment', 'expired', 'window')]
    const todos = [{ target: 1386, note: 'USB base update stuck in recovery', urgent: true }, { target: 1624, note: 'card install picks an older .bin', urgent: false }]
    const text = dailyReport(actions, todos, new Date('2026-11-17T07:00:00Z'))
    expect(text).toBe([
      'Modwerk, 17 Nov',
      'Waiting: 1 need your OK, 1 run unless you stop them (messages above).',
      '• 10:30 #1 close',
      'Done: 23 labels, 1 reply.',
      'At your computer: 2 to-dos, run /modwerk-todo.',
      '• #1386 USB base update stuck in recovery',
    ].join('\n'))
  })

  it('names failures and stuck actions, and says when nothing waits', () => {
    const now = new Date('2026-11-17T07:00:00Z')
    const text = dailyReport([row('merge', 'failed', 'window', { result: 'GitHub refused the merge' }), row('comment', 'running', 'window', { updated_at: now.getTime() / 1000 - 7200 })], [], now)
    expect(text).toBe('Modwerk, 17 Nov\nNothing waits for you.\n❌ #1 merge (GitHub refused the merge)\n❌ #1 comment (outcome unknown, check GitHub)')
  })
})

describe('maintenance bot weekly retro', () => {
  it('counts the week in one line and flags a kind of action that keeps being stopped or failing', async () => {
    const { weeklyRetro } = await import('./report.mjs')
    const now = new Date('2026-11-30T07:00:00Z'), at = days => now.getTime() / 1000 - days * 86400
    const rows = (kind, status, n, extra = {}) => Array.from({ length: n }, () => ({ kind, status, tier: 'window', created_at: at(2), ...extra }))
    const actions = [...rows('shout_reply', 'vetoed', 3), ...rows('shout_reply', 'done', 2), ...rows('board_reply', 'failed', 4), ...rows('merge', 'done', 6), ...rows('merge', 'vetoed', 1),
      ...rows('comment', 'expired', 2), ...rows('merge', 'pending', 2, { tier: 'ask', created_at: at(3) }), ...rows('merge', 'vetoed', 5, { created_at: at(9) })]
    expect(weeklyRetro(actions, { hard: { runs: 14, tokens: 2140000 }, light: { runs: 80, tokens: 5300000 } }, now)).toEqual({
      flags: ['3 of 5 shoutbox replies stopped', '4 of 4 board replies failed'],
      line: 'Last 7 days: 8 done, 4 stopped, 4 failed, 2 dropped, 2 waiting for you over 2 days. Read: reviews 2.1M tokens in 14 runs, the rest 5.3M tokens in 80 runs.',
    })
    expect(weeklyRetro([], {}, now)).toEqual({ flags: [], line: 'Last 7 days: 0 done, 0 stopped, 0 failed, 0 dropped.' })
  })
})

describe('maintenance bot to-do client', () => {
  it('lists urgent to-dos first, one line each', async () => {
    const { formatTodos } = await import('./todo.mjs')
    expect(formatTodos([])).toBe('No open to-dos.')
    expect(formatTodos([{ id: '9'.repeat(16), urgent: true, command: '/modwerk-fix-issue 1386', target: 1386, note: 'stuck' }])).toBe('9999999999999999  URGENT  /modwerk-fix-issue 1386  #1386: stuck')
  })
})

describe('maintenance bot model status', () => {
  it('says how the run ended and what it cost, never what it wrote', async () => {
    const { modelStatus } = await import('./model-status.mjs')
    const proposals = { actions: [{ kind: 'comment', number: 1, summary: 'Reply to Fraki', reason: 'Asked.', body: 'Hi Fraki' }], todos: [], drop: [] }
    const run = { subtype: 'success', is_error: false, num_turns: 31, duration_ms: 184000, result: 'Fraki asked about Keep', structured_output: proposals, usage: { input_tokens: 1200, cache_read_input_tokens: 480000, cache_creation_input_tokens: 52000, output_tokens: 9100 } }
    expect(modelStatus(JSON.stringify(run))).toEqual({ ok: true, proposals, cost: { tokens: 533200, out: 9100 }, line: 'Model run: success, 31 turns, 184 s; tokens: 1,200 in, 480,000 cache read, 52,000 cache write, 9,100 out.' })
    expect(modelStatus(JSON.stringify({ ...run, subtype: 'error_max_turns' })).ok).toBe(false)
    const silent = modelStatus(JSON.stringify({ ...run, structured_output: undefined }))
    expect(silent.ok).toBe(false)
    expect(silent.line).toMatch(/No proposals returned\.$/)
    expect(modelStatus('Fraki asked about Keep').line).not.toContain('Fraki')
    // Each lane's answer joins one file; only the three lists are taken, and every action carries its lane.
    const { addLane } = await import('./model-status.mjs')
    const merged = addLane({ actions: [{ kind: 'label', lane: 'light' }], todos: [], drop: [], items: { p1: 'x' }, usage: { light: { tokens: 9, out: 1 } } }, { ...proposals, items: { p1: 'forged' }, usage: { hard: 'forged' }, drop: ['t1'] }, 'hard', { tokens: 533200, out: 9100 })
    expect(merged).toEqual({ actions: [{ kind: 'label', lane: 'light' }, { ...proposals.actions[0], lane: 'hard' }], todos: [], drop: ['t1'], items: { p1: 'x' }, usage: { light: { tokens: 9, out: 1 }, hard: { tokens: 533200, out: 9100 } } })
  })
})
