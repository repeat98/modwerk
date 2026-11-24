// The grader owns the assertions. Each observation runs the candidate in a fresh Node process.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { findCase } from './cases.mjs'

export function grade(id, directory) {
  const item = findCase(id), cwd = realpathSync(directory), checks = []
  function observe(args, env = {}) {
    const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${cwd}`, ...args], {
      cwd, env: { HOME: cwd, TZ: 'UTC', MODWERK_BOARD: 'off', ...env }, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL',
    })
    if (result.error && !['ETIMEDOUT', 'ENOBUFS'].includes(result.error.code)) throw result.error
    return result
  }
  function check(name, passed) { checks.push({ name, passed: Boolean(passed) }) }
  const [file] = item.files
  if (id === 'board-holder') {
    for (const [name, args, invalid] of [
      ['missing login', ['--holder'], true], ['blank login', ['--holder', '  '], true],
      ['following option', ['--holder', '--released'], true], ['valid login', ['--holder', 'ada'], false], ['unfiltered list', [], false],
    ]) {
      const { status, stderr } = observe([file, 'list', ...args])
      check(name, status === 1 && (invalid ? /--holder/i.test(stderr) && /login|username|handle/i.test(stderr) : stderr.includes('board is turned off')))
    }
  } else if (id === 'bold-guides') {
    const description = 'Updates the board listing and checks its behavior with a local fixture.\n\n'
    for (const [name, answer, accepted] of [
      ['bold label', '**Guides:** nothing', true], ['bold question', '**What the guides lacked**\n\nUpdated the setup guide.', true],
      ['unanswered heading', '**What the guides lacked**\n\n**Related issues**', false], ['plain label', 'Guides: nothing', true], ['missing answer', '', false],
    ]) {
      const { status, stdout } = observe([file], { PR_BODY: description + answer })
      check(name, accepted ? status === 0 : status === 1 && stdout.includes('Say what the guides lacked'))
    }
  } else if (id === 'diagnostic-summary') {
    const events = [
      { event: 'link_failed', phase: 'idle', failure: 'no-device' }, { event: 'health', phase: 'ready' },
      { event: 'link_failed', phase: 'idle', failure: 'claim-failed', client: { browser: 'chrome', major: 150, os: 'linux' } },
      { event: 'sync_failed', phase: 'sending', error: 'device' },
    ].map((data, n) => ({ data, eventId: `e${n}`, username: 'fixture', createdAt: `2026-10-15T12:00:0${n}Z` }))
    const { status, stdout } = observe(['--input-type=module', '-e', `import { summary } from './${file}'; console.log(summary(${JSON.stringify({ events, counts: [] })}))`])
    const problems = (stdout ?? '').split('Problems (')[1] ?? ''
    const rows = problems.split('\n').slice(1, 4)
    check('three problems, excluding healthy records', status === 0 && problems.startsWith('3,'))
    check('existing sync failure first', status === 0 && rows[0]?.includes('sync_failed sending error=device'))
    check('reason with client', status === 0 && ['link_failed', 'claim-failed', 'chrome', 'linux'].every(value => rows[1]?.includes(value)))
    check('reason without client', status === 0 && ['link_failed', 'no-device'].every(value => rows[2]?.includes(value)))
  } else throw new Error(`No grader for ${id}`)
  return { case: id, merge: item.merge, passed: checks.every(test => test.passed), checks }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(JSON.stringify(grade(process.argv[2], process.argv[3])))
}
