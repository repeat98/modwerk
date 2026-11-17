import { describe, expect, it } from 'vitest'
import { checkText, classify } from './policy.mjs'

const pull = (extra = {}) => ({ number: 5, isPull: true, author: 'alice', state: 'open', comments: 2, draft: false, head: 'a1', files: ['sdk/octatrack/modules/tapeecho/src/main.c'], firstTime: false, checksGreen: true, ...extra })
const issue = (extra = {}) => ({ number: 9, isPull: false, author: 'bob', state: 'open', comments: 1, head: '', files: [], ...extra })
const merge = (extra = {}) => ({ kind: 'merge', number: 5, head: 'a1', summary: 'Merge Tape Echo 0.4', reason: 'Green.', ...extra })

describe('maintenance bot policy', () => {
  it('merges a green module pull request after the window, with a merge commit for catalogue rows', () => {
    expect(classify(merge(), pull())).toMatchObject({ tier: 'window', windowHours: 12, payload: { method: 'merge', head: 'a1' } })
    expect(classify(merge(), pull({ files: ['src/App.tsx'] })).payload.method).toBe('squash')
  })

  it('asks the owner before merging anything sensitive or from a first-time contributor', () => {
    for (const file of ['.github/workflows/x.yml', 'scripts/maintenance-bot/policy.mjs', 'migrations/0099_x.sql', 'package-lock.json', 'server/auth.ts', 'sdk/octabam/base/x.c', 'sdk/runtime/a.c', 'AGENTS.md']) {
      const decision = classify(merge(), pull({ files: ['src/App.tsx', file] }))
      expect([file, decision.tier]).toEqual([file, 'ask'])
      expect(decision.reason).toContain('Asking because it touches protected files')
    }
    expect(classify(merge(), pull({ firstTime: true })).tier).toBe('ask')
  })

  it('never merges a draft, a red or pending pull request, or another commit than the one reviewed', () => {
    expect(classify(merge(), pull({ draft: true })).reject).toBeTruthy()
    expect(classify(merge(), pull({ checksGreen: false })).reject).toBeTruthy()
    expect(classify(merge({ head: 'b2' }), pull()).reject).toBeTruthy()
    expect(classify(merge(), issue()).reject).toBeTruthy()
    expect(classify(merge(), pull({ state: 'closed' })).reject).toBeTruthy()
  })

  it('refuses any kind it does not know', () => {
    for (const kind of ['push', 'release', 'deploy', 'delete_branch', 'approve', undefined]) expect(classify({ kind, number: 5, summary: 'x' }, pull()).reject).toBeTruthy()
  })

  it('posts a request for details at once, other replies after a window, and turning down a pull request only with the owner’s OK', () => {
    expect(classify({ kind: 'comment', number: 9, intent: 'ask_details', body: 'Which OS version?', summary: 'Ask' }, issue()).tier).toBe('notify')
    expect(classify({ kind: 'comment', number: 9, body: 'Fixed in 0.4.', summary: 'Answer' }, issue())).toMatchObject({ tier: 'window', windowHours: 4 })
    expect(classify({ kind: 'review', number: 5, event: 'REQUEST_CHANGES', body: 'Add a changelog entry.', summary: 'Review' }, pull())).toMatchObject({ tier: 'window', payload: { event: 'REQUEST_CHANGES' } })
    expect(classify({ kind: 'close', number: 9, body: 'Fixed and live.', summary: 'Close' }, issue())).toMatchObject({ tier: 'window', payload: { stateReason: 'completed' } })
    expect(classify({ kind: 'decline', number: 5, body: 'One effect per module.', summary: 'Decline' }, pull()).tier).toBe('ask')
    expect(classify({ kind: 'close', number: 5, body: 'Superseded.', summary: 'Close' }, pull({ author: 'repeat98' })).tier).toBe('window')
    expect(classify({ kind: 'close', number: 9, summary: 'Close' }, issue()).reject).toBeTruthy()
  })

  it('keeps public text plain: no mass mentions, no outside links', () => {
    expect(checkText('Thanks @bob, fixed.', 'bob')).toBe('')
    expect(checkText('cc @carol', 'bob')).toContain('mentions')
    expect(checkText('See https://evil.example/x', 'bob')).toContain('links')
    expect(checkText('See https://github.com/repeat98/modwerk/pull/1', 'bob')).toBe('')
    expect(checkText('x'.repeat(3001), 'bob')).toContain('3000')
    expect(classify({ kind: 'comment', number: 9, body: '@everyone look', summary: 'Spam' }, issue()).reject).toBeTruthy()
  })

  it('sets only known labels, and pins each action to the state it saw', () => {
    const labels = new Set(['bug', 'needs-info'])
    expect(classify({ kind: 'label', number: 9, add: ['bug'], summary: 'Label' }, issue(), labels).tier).toBe('notify')
    expect(classify({ kind: 'label', number: 9, add: ['admin'], summary: 'Label' }, issue(), labels).reject).toBeTruthy()
    expect(classify({ kind: 'label', number: 9, add: ['priority:P1'], summary: 'Label' }, issue(), labels).reject).toBeTruthy()
    const before = classify({ kind: 'comment', number: 9, body: 'Hi', summary: 'Reply' }, issue())
    const after = classify({ kind: 'comment', number: 9, body: 'Hello', summary: 'Reply' }, issue({ comments: 2 }))
    expect(before.id).toMatch(/^[a-f0-9]{16}$/)
    expect(before.id).not.toBe(after.id)
    expect(classify({ kind: 'comment', number: 9, body: 'Other words', summary: 'Reply' }, issue()).id).toBe(before.id)
  })
})
