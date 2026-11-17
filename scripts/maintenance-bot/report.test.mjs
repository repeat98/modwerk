import { describe, expect, it } from 'vitest'
import { dailyReport } from './report.mjs'

const row = (kind, status, tier = 'notify', extra = {}) => ({ kind, status, tier, summary: '#1 ' + kind, result: '', updated_at: 0, ...extra })

describe('maintenance bot report', () => {
  it('counts what was done and what waits, in a few lines', () => {
    const actions = [...Array(23).fill(row('label', 'done')), row('comment', 'done'), row('merge', 'pending', 'ask'), row('close', 'pending', 'window'), row('review', 'vetoed', 'window'), row('comment', 'expired', 'window')]
    const todos = [{ target: 1386, note: 'USB base update stuck in recovery', urgent: true }, { target: 1624, note: 'card install picks an older .bin', urgent: false }]
    const text = dailyReport(actions, todos, new Date('2026-11-17T07:00:00Z'))
    expect(text).toBe([
      'Modwerk, 17 Nov',
      'Waiting: 1 need your OK, 1 run unless you stop them (messages above).',
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

describe('maintenance bot to-do client', () => {
  it('lists urgent to-dos first, one line each', async () => {
    const { formatTodos } = await import('./todo.mjs')
    expect(formatTodos([])).toBe('No open to-dos.')
    expect(formatTodos([{ id: '9'.repeat(16), urgent: true, command: '/modwerk-fix-issue 1386', target: 1386, note: 'stuck' }])).toBe('9999999999999999  URGENT  /modwerk-fix-issue 1386  #1386: stuck')
  })
})
