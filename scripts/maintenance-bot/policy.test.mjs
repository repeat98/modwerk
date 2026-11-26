import { describe, expect, it } from 'vitest'
import { checkText, classify } from './policy.mjs'

const pull = (extra = {}) => ({ number: 5, isPull: true, author: 'alice', state: 'open', comments: 2, draft: false, head: 'a1', files: ['sdk/octatrack/modules/tapeecho/src/main.c'], firstTime: false, checksGreen: true, ...extra })
const issue = (extra = {}) => ({ number: 9, isPull: false, author: 'bob', state: 'open', comments: 1, head: '', files: [], ...extra })
const merge = (extra = {}) => ({ kind: 'merge', number: 5, head: 'a1', summary: 'Merge Tape Echo 0.4', reason: 'Green.', ...extra })

describe('maintenance bot policy', () => {
  it('merges a green pull request after the window, and asks before someone else’s merge that publishes modules', () => {
    expect(classify(merge(), pull({ files: ['src/App.tsx'] }))).toMatchObject({ tier: 'window', windowHours: 12, payload: { method: 'squash', head: 'a1' } })
    for (const file of ['sdk/octatrack/modules/tapeecho/src/main.c', 'sdk/imports/mute-latch.json', 'src/catalog/modules.ts', 'src/community/module-changelogs/euclid.md']) {
      const decision = classify(merge(), pull({ files: [file] }))
      expect([file, decision.tier, decision.reason]).toEqual([file, 'ask', 'Green.\nAsking because merging it publishes modules on the site.'])
    }
    expect(classify(merge(), pull()).payload.method).toBe('merge')
  })

  it('merges the owner’s own pull request after an hour, releases included, and still asks for the core', () => {
    const own = extra => pull({ author: 'repeat98', ...extra })
    expect(classify(merge(), own({ files: ['src/App.tsx'] }))).toMatchObject({ tier: 'window', windowHours: 1 })
    expect(classify(merge(), own())).toMatchObject({ tier: 'window', windowHours: 1, payload: { method: 'merge' } })
    for (const file of ['.github/workflows/x.yml', 'scripts/maintenance-bot/policy.mjs', 'migrations/0099_x.sql', 'package-lock.json', 'server/auth.ts', 'sdk/machines/octatrack/base-binding.json', 'sdk/octabam/AGENTS.md']) {
      expect([file, classify(merge(), own({ files: [file] })).tier]).toEqual([file, 'ask'])
    }
    // A base for any device never merges on a timer: by its branch, into its branch, or by its built files.
    for (const extra of [{ headRef: 'base/octatrack-next', baseRef: 'main' }, { headRef: 'machine/digitone-ii-link', baseRef: 'base/digitone-ii-next' }, { files: ['public/base/octatrack.json'] }, { files: ['src/engine/assets/octatrack-base.elemod'] }, { headRef: 'docs/x', baseRef: 'base/syntakt-next', files: ['sdk/machines/syntakt/GOAL.md'] }]) {
      for (const author of ['repeat98', 'alice']) {
        const decision = classify(merge(), pull({ author, files: ['docs/x.md'], ...extra }))
        expect([extra, author, decision.tier]).toEqual([extra, author, 'ask'])
        expect(decision.reason).toContain('Asking because a base merges only after its review.')
      }
    }
    // Documentation under sdk/ cannot change what runs.
    expect(classify(merge(), own({ files: ['sdk/machines/digitone-ii/GOAL.md'] })).tier).toBe('window')
    expect(classify(merge(), pull({ files: ['sdk/machines/analog-rytm-mkii/README.md'] }))).toMatchObject({ tier: 'window', windowHours: 12 })
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

  it('gives every action it accepts a summary the ledger takes', () => {
    // A merge once lost its summary to a shadowed name, and the Worker refused the whole pass (26 November 2026).
    const thread = { kind: 'thread', id: 't1', number: 0, author: 'alice', to: 'repeat98', replies: 0, state: 'open' }
    const proposals = [[merge(), pull()], [merge(), pull({ headRef: 'base/octatrack-next' })], [{ kind: 'label', number: 9, add: ['bug'] }, issue()], [{ kind: 'comment', number: 9, body: 'Hi' }, issue()],
      [{ kind: 'review', number: 5, body: 'Hi' }, pull()], [{ kind: 'close', number: 9, body: 'Done.' }, issue()], [{ kind: 'approve_run', number: 5 }, pull({ waitingRuns: 1 })],
      [{ kind: 'board_reply', thread: 't1', body: 'Hi' }, thread], [{ kind: 'board_close', thread: 't1' }, thread], [{ kind: 'board_release', claim: 'c1' }, { kind: 'claim', id: 'c1', state: 'open' }]]
    for (const [proposal, target] of proposals) {
      const decision = classify({ summary: 'Do it', ...proposal }, target, new Set(['bug']))
      expect([proposal.kind, typeof decision.summary, decision.summary.length > 0 && decision.summary.length <= 300]).toEqual([proposal.kind, 'string', true])
    }
  })

  it('refuses any kind it does not know', () => {
    for (const kind of ['push', 'release', 'deploy', 'delete_branch', 'approve', undefined]) expect(classify({ kind, number: 5, summary: 'x' }, pull()).reject).toBeTruthy()
  })

  it('posts a request for details at once, other replies after a window, and turning down a pull request only with the owner’s OK', () => {
    expect(classify({ kind: 'comment', number: 9, intent: 'ask_details', body: 'Which OS version?', summary: 'Ask' }, issue()).tier).toBe('notify')
    expect(classify({ kind: 'comment', number: 9, body: 'Fixed in 0.4.', summary: 'Answer' }, issue())).toMatchObject({ tier: 'window', windowHours: 1 })
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

  it('answers board questions after a window, and asks before ending someone else’s thread or claim', () => {
    const thread = (extra = {}) => ({ kind: 'thread', id: 't1', number: 0, author: 'alice', replies: 1, state: 'open', ...extra })
    const reply = classify({ kind: 'board_reply', thread: 't1', body: 'See docs/AGENT_BOARD.md#claims.', summary: 'Answer alice' }, thread())
    expect(reply).toMatchObject({ tier: 'window', windowHours: 1, summary: 'Board: Answer alice', payload: { thread: 't1', pin: { replies: 1 } } })
    expect(classify({ kind: 'board_reply', thread: 't1', body: 'x'.repeat(501), summary: 'Long' }, thread()).reject).toContain('500')
    expect(classify({ kind: 'board_reply', thread: 't1', body: 'Hi', summary: 'Late' }, thread({ state: 'closed' })).reject).toBeTruthy()
    expect(classify({ kind: 'board_close', thread: 't1', summary: 'Close' }, thread()).tier).toBe('ask')
    expect(classify({ kind: 'board_close', thread: 't1', summary: 'Close' }, thread({ author: 'repeat98' })).tier).toBe('window')
    expect(classify({ kind: 'board_release', claim: 'c1', summary: 'Release' }, { kind: 'claim', id: 'c1', number: 0, holder: 'bob', state: 'open' }).tier).toBe('ask')
    expect(classify({ kind: 'board_release', claim: 't1', summary: 'Release' }, thread()).reject).toBeTruthy()
    expect(reply.id).not.toBe(classify({ kind: 'board_reply', thread: 't1', body: 'Hi', summary: 'Answer' }, thread({ replies: 2 })).id)
  })

  it('lets TARS answer each unanswered Discord message once, after an hour, without pinging anyone', () => {
    const message = (extra = {}) => ({ kind: 'discord', number: 0, channel: '155', id: '157', author: 'fraki', bot: false, state: 'open', ...extra })
    const reply = classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'Try a power cycle, then Keep again.', summary: 'Help fraki with Keep' }, message())
    expect(reply).toMatchObject({ tier: 'window', windowHours: 1, summary: 'Discord: Help fraki with Keep', payload: { channel: '155', message: '157' } })
    expect(reply.id).toBe(classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'Other words', summary: 'Again' }, message()).id)
    expect(classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'Hey @fraki try this', summary: 'Ping' }, message()).reject).toContain('mentions')
    expect(classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'See https://evil.example', summary: 'Link' }, message()).reject).toContain('links')
    expect(classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'Hi', summary: 'Bot' }, message({ bot: true })).reject).toBeTruthy()
    expect(classify({ kind: 'discord_reply', channel: '155', message: '157', body: 'Hi', summary: 'Answered' }, message({ state: 'closed' })).reject).toContain('answered')
  })

  it('lets TARS answer an open forum thread or shout once, kindly and by name', () => {
    const thread = { kind: 'forum', id: 't1', number: 0, author: 'ana', lastPost: 'p1', state: 'open' }
    const reply = classify({ kind: 'forum_reply', thread: 't1', body: 'Hi @ana! Power cycle once after Keep.', summary: 'Help Ana with Keep' }, thread)
    expect(reply).toMatchObject({ tier: 'window', windowHours: 1, summary: 'Forum: Help Ana with Keep', payload: { thread: 't1', after: 'p1' } })
    expect(classify({ kind: 'forum_reply', thread: 't1', body: 'cc @bob', summary: 'x' }, thread).reject).toContain('mentions')
    expect(classify({ kind: 'forum_reply', thread: 't1', body: 'x', summary: 'x' }, { ...thread, state: 'closed' }).reject).toBeTruthy()
    const shout = { kind: 'shout', id: 's1', number: 0, author: 'ana', state: 'open' }
    expect(classify({ kind: 'shout_reply', shout: 's1', body: '@ana it is in the device panel', summary: 'Answer Ana' }, shout)).toMatchObject({ summary: 'Shoutbox: Answer Ana', payload: { shout: 's1' } })
    expect(classify({ kind: 'shout_reply', shout: 's1', body: 'x'.repeat(601), summary: 'Long' }, shout).reject).toContain('600')
    expect(classify({ kind: 'shout_reply', shout: 's1', body: 'x', summary: 'x' }, thread).reject).toBeTruthy()
  })

  it('answers agents who ask TARS at once, as TARS, and answers for the owner only after a window', () => {
    const thread = { kind: 'thread', id: 't9', number: 0, author: 'zac', to: 'tars', replies: 0, state: 'open' }
    expect(classify({ kind: 'board_reply', thread: 't9', body: '@zac #1642 waits on its MKII run.', summary: 'Tell zac where #1642 stands' }, thread)).toMatchObject({ tier: 'notify', payload: { as: 'tars' } })
    expect(classify({ kind: 'board_reply', thread: 't9', body: 'Hi', summary: 'x' }, { ...thread, to: 'repeat98' })).toMatchObject({ tier: 'window', payload: { as: 'owner' } })
  })

  it('posts the answer it recommends for the owner after a day unless stopped, and asks before any exception to a rule', () => {
    const decision = classify({ kind: 'comment', number: 9, intent: 'decision', body: 'Yes, go ahead with the port.', summary: 'OK the Analog BD port: yes' }, issue())
    expect(decision).toMatchObject({ tier: 'window', windowHours: 24, payload: { kind: 'comment', body: 'Yes, go ahead with the port.' } })
    expect(decision.id).not.toBe(classify({ kind: 'comment', number: 9, body: 'Yes, go ahead with the port.', summary: 'Answer' }, issue()).id)
    // The model marks an exception; the words catch one it did not mark.
    expect(classify({ kind: 'comment', number: 9, intent: 'decision', exception: true, body: 'Yes, this once.', summary: 'OK the copied table: yes' }, issue())).toMatchObject({ tier: 'ask', windowHours: 0 })
    expect(classify({ kind: 'comment', number: 5, intent: 'decision', body: 'Scope exception granted.', summary: 'x' }, pull()).tier).toBe('ask')
    expect(classify({ kind: 'comment', number: 5, intent: 'decision', body: 'Yes.', summary: 'Waive the hardware record: yes' }, pull()).tier).toBe('ask')
    const thread = { kind: 'thread', id: 't3', number: 0, author: 'twwwy', to: 'repeat98', replies: 0, state: 'open' }
    expect(classify({ kind: 'board_reply', thread: 't3', intent: 'decision', body: 'Yes, Kits may share the menu.', summary: 'x' }, thread)).toMatchObject({ tier: 'window', windowHours: 24, payload: { as: 'owner' } })
    expect(classify({ kind: 'board_reply', thread: 't3', intent: 'decision', exception: true, body: 'Yes.', summary: 'x' }, thread)).toMatchObject({ tier: 'ask', payload: { as: 'owner' } })
    expect(classify({ kind: 'board_reply', thread: 't3', intent: 'decision', body: 'Yes.', summary: 'x' }, { ...thread, to: 'tars' }).tier).toBe('notify')
  })

  it('starts a first-time contributor’s waiting checks at once, and asks when the diff changes what the checks run from', () => {
    const approve = { kind: 'approve_run', number: 5, summary: 'Start checks' }
    expect(classify(approve, pull({ waitingRuns: 2, firstTime: true }))).toMatchObject({ tier: 'notify', windowHours: 0, payload: { kind: 'approve_run', pin: { head: 'a1' } } })
    for (const file of ['.github/workflows/module-pr.yml', 'scripts/check.mjs', 'package.json', 'package-lock.json', 'vitest.config.ts']) {
      const decision = classify(approve, pull({ waitingRuns: 2, firstTime: true, files: ['sdk/octatrack/modules/x/src/main.c', file] }))
      expect([file, decision.tier]).toEqual([file, 'ask'])
      expect(decision.reason).toContain('Asking because it changes what the checks run from')
    }
    expect(classify(approve, pull({ waitingRuns: 0 })).reject).toContain('no run waits')
    expect(classify(approve, issue()).reject).toBeTruthy()
  })
})
