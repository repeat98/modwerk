import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { bodyProblems, localBase, parseArgs } from './pr-body.mjs'

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')

const workflow = name => parse(readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'))

it('checks the description on pushes, edits and draft transitions, and an edit reruns nothing else', () => {
  const description = workflow('pr-description.yml'), checks = workflow('module-pr.yml')
  expect(description.on.pull_request.types).toEqual(expect.arrayContaining(['opened', 'synchronize', 'edited', 'converted_to_draft', 'ready_for_review', 'reopened']))
  expect(checks.on.pull_request.types).not.toContain('edited')
  expect(checks.jobs.describe).toBeUndefined()
})

it('checks the description of a pull request into main or a cumulative base draft', () => {
  const description = workflow('pr-description.yml')
  expect(description.on.pull_request.branches).toEqual(expect.arrayContaining(['main', 'base/*-next']))
  expect(description.jobs.describe.if).toMatch(/github\.base_ref == 'main'/)
  expect(description.jobs.describe.if).toMatch(/startsWith\(github\.base_ref, 'base\/'\) && endsWith\(github\.base_ref, '-next'\)/)
  expect(workflow('module-pr.yml').on.pull_request.branches).not.toContain('base/*-next')
})

it('runs the jobs that repeat the catalogue checks only after module-contract passed, so one problem is one red job', () => {
  const { jobs } = workflow('module-pr.yml')
  for (const name of ['module-suites', 'module-paths-windows', 'octatrack-source']) expect([jobs[name].needs].flat(), name).toEqual(['scope', 'module-contract'])
  for (const [name, job] of Object.entries(jobs)) if (!['scope', 'module-pr-ok'].includes(name)) expect([job.needs].flat(), name).toContain('scope')
  expect(jobs['module-pr-ok'].needs).toEqual(expect.arrayContaining(Object.keys(jobs).filter(name => name !== 'module-pr-ok')))
})

it('refuses an empty description or the template as it came, and asks for the guides answer', () => {
  expect(bodyProblems('', template)).toHaveLength(2)
  expect(bodyProblems(null, template)).toHaveLength(2)
  expect(bodyProblems(template, template)).toHaveLength(2)
  // The template with its boxes ticked and nothing written is still undescribed.
  expect(bodyProblems(template.replaceAll('- [ ]', '- [x]'), template)).toHaveLength(2)
  const described = 'Slow LFO 0.1.0: LFO MULT gets 1/2X and 1/4X steps below 1X on every LFO page, tested on an MKII over USB.'
  expect(bodyProblems(described + '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)', template)).toEqual([expect.stringMatching(/^Say what the guides lacked/)])
})

it('accepts a description in the template\'s own shape and in free form', () => {
  const filled = template
    .replace('- **What was wrong or hard:**', '- **What was wrong or hard:** the triage bot missed pull requests under sdk/drafts.')
    .replace('- **What the guides lacked or got wrong, and where I fixed it:** ("nothing" is a fine answer)', '- **What the guides lacked or got wrong, and where I fixed it:** nothing')
  expect(bodyProblems(filled, template)).toEqual([])
  expect(bodyProblems('Moves the hook table to Y $7E00 and rebuilds the base packages; checked with pr:ready and a unit run.\n\nGuides: nothing.', template)).toEqual([])
  expect(bodyProblems('Moves the hook table to Y $7E00 and rebuilds the base packages; checked with pr:ready.\n\n## What the guides lacked\n\ndocs/module-guides/README.md had no word on Y memory; fixed there.', template)).toEqual([])
  // Bold in place of a heading or a bullet, as #1333 wrote it.
  const free = 'Moves the hook table to Y $7E00 and rebuilds the base packages; checked with pr:ready.\n\n'
  expect(bodyProblems(free + '**What the guides lacked or got wrong, and where I fixed it**\n\nUpdated the base README.', template)).toEqual([])
  expect(bodyProblems(free + '**Guides:** nothing', template)).toEqual([])
  // A bold question followed only by the next bold question is unanswered.
  expect(bodyProblems(free + '**What the guides lacked**\n\n**Related issues**', template)).toEqual([expect.stringMatching(/^Say what the guides lacked/)])
  // The question with its answer as a list below it, as #1552 wrote it; with the next question below it, unanswered.
  expect(bodyProblems(free + '- **What the guides lacked or got wrong, and where I fixed it:**\n  - `docs/ADD_A_MODULE.md` did not say it. Added.', template)).toEqual([])
  expect(bodyProblems(free + '- **What the guides lacked or got wrong, and where I fixed it:**\n- **Related issues:**\n  - none', template)).toEqual([expect.stringMatching(/^Say what the guides lacked/)])
  // A link to a guide is not an answer.
  expect(bodyProblems('Follows docs/module-guides/effects.md for the new reverb; checked with pr:ready and on an MKII.', template)).toEqual([expect.stringMatching(/^Say what the guides lacked/)])
})

it('asks a ready pull request that changes what runs on an instrument to name the build that ran on a unit', () => {
  // The edge cases are their own check (below); this one is about the build.
  const described = 'Octatrack base 0.7.8: a module that no track uses rests out of the per-frame hooks; checked with pr:ready.\n\nGuides: HOOKS.md.\n\nEdge cases: none, because this test is about the unit line.'
  const base = ['src/engine/assets/octatrack-base.elemod', 'sdk/runtime/loader/loader.c']
  const untested = expect.stringMatching(/^This pull request changes what runs on an instrument \(src\/engine\/assets\/octatrack-base\.elemod\)/)
  // A draft may still be in test; a ready one says what ran, on which build.
  expect(bodyProblems(described, template, { draft: true, files: base })).toEqual([])
  expect(bodyProblems(described, template, { files: base })).toEqual([untested])
  expect(bodyProblems(described + '\n\nTested on a unit: base 8d1db124, MKII, a full set and a power cycle.', template, { files: base })).toEqual([])
  expect(bodyProblems(described + '\n\n- **Tested on a unit:** `8d1db124797e`, MKII', template, { files: base })).toEqual([])
  // It must name the build: a hash of 8 hex digits or more.
  expect(bodyProblems(described + '\n\nTested on a unit: yes, on my MKII.', template, { files: base })).toEqual([untested])
  expect(bodyProblems(described + '\n\nNot tested on a unit: no unit at hand; the owner decides.', template, { files: base })).toEqual([])
  expect(bodyProblems(described + '\n\nNot tested on a unit:', template, { files: base })).toEqual([untested])
  expect(bodyProblems(described, template, { files: ['public/zoom-effects/microloom/2.0.0/Microlm.ZDL'] })).toEqual([expect.stringMatching(/Tested on a unit/)])
  // A package counts too; sources, docs and the site do not.
  expect(bodyProblems(described, template, { files: ['public/octatrack-modules/repitch/0.2.1-experimental.mwrm'] })).toHaveLength(1)
  expect(bodyProblems(described, template, { files: ['sdk/octatrack/modules/repitch/repitch.s', 'docs/MODULE_PERFORMANCE.md', 'src/App.tsx'] })).toEqual([])
})

it('asks a ready pull request that changes what runs on an instrument for its edge cases, in a table or as none with a reason', () => {
  const described = 'Octatrack base 0.7.8: a module that no track uses rests out of the per-frame hooks; checked with pr:ready.\n\nGuides: HOOKS.md.\n\nTested on a unit: base 8d1db124, MKII, the large set.'
  const files = ['src/engine/assets/octatrack-base.elemod']
  const missing = expect.stringMatching(/^This pull request changes what runs on an instrument, so it lists the edge cases/)
  const incomplete = expect.stringMatching(/^The edge-case table under "Edge cases" has a row still to finish: row "/)
  const table = '\n\n## Edge cases\n\n| Case | Why this change makes it a risk | How run | Result |\n|---|---|---|---|\n'
  const row = '| A module resting while its page is open | resting skips its tick | trial, open the page, stop the transport | pass |\n'
  // A change that runs nowhere needs none; a draft does, and may say honestly what it has not run yet.
  expect(bodyProblems(described, template, { files: ['src/App.tsx'] })).toEqual([])
  expect(bodyProblems(described, template, { draft: true, files })).toEqual([missing])
  expect(bodyProblems(described + table + '| Undo with the page open | the change moved the page | trial, Undo | not run: waiting for the unit |\n', template, { draft: true, files })).toEqual([])
  expect(bodyProblems(described + '\n\nEdge cases: none, because the change renames a symbol the build strips.', template, { draft: true, files })).toEqual([])
  expect(bodyProblems(described, template, { files })).toEqual([missing])
  expect(bodyProblems(described + table + row, template, { files })).toEqual([])
  expect(bodyProblems(described + table + row + '| Undo with the page open | the same | trial, Undo | not run: no MKI at hand |\n', template, { files })).toEqual([])
  // As "Edge cases" in bold or a bullet, with an introduction above the table.
  expect(bodyProblems(described + '\n\n**Edge cases**\n\nFrom the hook change:\n\n| Case | Why | How | Result |\n|---|---|---|---|\n' + row, template, { files })).toEqual([])
  expect(bodyProblems(described + '\n\n- **Edge cases:** none, because the change only renames a symbol the build strips.', template, { files })).toEqual([])
  // None needs its reason; a header with no row, an empty row, a row without its result or a bare "not run" is not a list.
  expect(bodyProblems(described + '\n\nEdge cases: none.', template, { files })).toEqual([missing])
  expect(bodyProblems(described + table, template, { files })).toEqual([missing])
  expect(bodyProblems(described + table + '| | | | |\n', template, { files })).toEqual([missing])
  expect(bodyProblems(described + table + '| A module resting | resting skips its tick | trial | |\n', template, { files })).toEqual([incomplete])
  expect(bodyProblems(described + table + '| A module resting | resting skips its tick | trial | not run |\n', template, { files })).toEqual([incomplete])
  expect(bodyProblems(described + table + row + '| Undo | the same | trial | not run: |\n', template, { files })).toEqual([incomplete])
  // A table under another heading is not the edge cases.
  expect(bodyProblems(described + '\n\n## Timings\n\n| Case | Before | After | Result |\n|---|---|---|---|\n| UI tick | 54 | 50 | faster |\n', template, { files })).toEqual([missing])
  // The template's own line, answered below it.
  const filled = template.replace('- **What was wrong or hard:**', '- **What was wrong or hard:** the base visited every slot on each tick.')
    .replace('- **What the guides lacked or got wrong, and where I fixed it:** ("nothing" is a fine answer)', '- **What the guides lacked or got wrong, and where I fixed it:** nothing')
    .replace(/^(- \*\*Edge cases:\*\*.*)$/m, '$1\n\n| Case | Why | How | Result |\n|---|---|---|---|\n' + row)
    .replace('- **Tested on a unit:**', '- **Tested on a unit:** base 8d1db124, MKII.')
  expect(bodyProblems(filled, template, { files })).toEqual([])
})

const ready = 'Mackity 0.1.0: a desk input stage for FX1/FX2; checked with pr:ready and on the unit.\n\nGuides: nothing.\n\nTested on a unit: package 64d0386d9aa1, MKII, eight instances.'
const edgeTable = '\n\n## Edge cases\n\n| Case | Why this change makes it a risk | How run | Result |\n|---|---|---|---|\n| Eight instances at once | per-instance state | device:test | pass |\n'
const mwrm = ['public/octatrack-modules/mackity/0.1.0-experimental.mwrm']

it('names each unfinished edge-case row and what it lacks', () => {
  // #2148: the last row said "not run" without why, and the check only asked for a table.
  expect(bodyProblems(ready + edgeTable + '| Part/project reload | stored knob bytes | not run on the unit | not run |\n', template, { files: mwrm })).toEqual([
    'The edge-case table under "Edge cases" has a row still to finish: row "Part/project reload": the result says "not run" without why; write "not run: <why>". Each case is a row | Case | Why this change makes it a risk | How run | Result |, the result "pass", "fail: what happened" or "not run: why" (docs/TEST_PROCEDURE.md#edge-cases).'])
  const one = extra => bodyProblems(ready + edgeTable + extra, template, { files: mwrm })[0]
  expect(one('| Silence after audio | limit cycles | verify.py | |\n')).toContain('row "Silence after audio": its last cell, the result, is empty; write "pass", "fail: what happened" or "not run: why"')
  expect(one('| Part switches | device:test | pass |\n')).toContain('row "Part switches": it has 3 cells, and a case has four: | Case |')
  expect(one('| | knob words | device:test | pass |\n')).toContain('row "| | knob words | device:test | pass |": its first cell, the case, is empty')
  expect(one('| Undo | the same | trial | Not run. |\n')).toContain('the result says "Not run." without why')
  expect(one('| ' + 'A very long case name that goes on and on about the Part, the project and a reload'.padEnd(80, '.') + ' | x | y | not run |\n'))
    .toContain('row "A very long case name that goes on and on about the Part,…":')
  // Every unfinished row, each once, though two lines name the same table.
  const two = bodyProblems(ready + '\n\n## Edge cases\n\nEdge cases from the procedure:\n\n| Case | Why | How | Result |\n|---|---|---|---|\n| A | x | y | not run |\n| B | x | y | pass |\n| C | x | y | |\n', template, { files: mwrm })
  expect(two).toHaveLength(1)
  expect(two[0]).toMatch(/^The edge-case table under "Edge cases" has 2 rows still to finish: row "A": the result says "not run" without why; write "not run: <why>"; row "C": its last cell, the result, is empty/)
})

it('says why no edge cases were found', () => {
  const missing = extra => bodyProblems(ready + extra, template, { files: mwrm })
  expect(missing('')).toEqual([expect.stringContaining('No line or heading "Edge cases" was found.')])
  expect(missing('\n\nEdge cases: none.')).toEqual([expect.stringContaining('It says "none" without why: write "Edge cases: none, because …".')])
  expect(missing('\n\n## Edge cases\n\n| Case | Why | How | Result |\n|---|---|---|---|\n')).toEqual([expect.stringContaining('no table row with its case and result follows')])
  for (const problem of [...missing(''), ...missing('\n\nEdge cases: none.')]) expect(problem).toMatch(/^This pull request changes what runs on an instrument, so it lists the edge cases/)
})

it('reads the local command line', () => {
  expect(parseArgs(['body.md'])).toEqual({ file: 'body.md', draft: false, since: null })
  expect(parseArgs(['--draft', '-', '--changed-since', 'base/octatrack-next'])).toEqual({ file: '-', draft: true, since: 'base/octatrack-next' })
  expect(parseArgs([]).error).toMatch(/Name the description file/)
  expect(parseArgs(['a.md', 'b.md']).error).toMatch(/One description file/)
  expect(parseArgs(['a.md', '--changed-since']).error).toMatch(/--changed-since needs a ref/)
  expect(parseArgs(['a.md', '--changed-since', '--draft']).error).toMatch(/--changed-since needs a ref/)
  expect(parseArgs(['a.md', '--ready']).error).toMatch(/Unknown option --ready/)
  expect(localBase(null, ['origin', 'upstream'])).toBe('upstream/main')
  expect(localBase(null, ['origin'])).toBe('origin/main')
  expect(localBase('base/octatrack-next', ['origin', 'upstream'])).toBe('base/octatrack-next')
})

it('checks a description file locally as CI would on this branch: ready or draft, against the base it merges into', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'modwerk-pr-body-')))
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(directory, 'no-global-config') }
  for (const name of ['PR_FILES', 'PR_BODY', 'PR_DRAFT', 'INIT_CWD']) delete env[name]
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Description test', '-c', 'user.email=description@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: directory, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const run = (args, extra = {}) => spawnSync(process.execPath, [join(directory, 'scripts', 'pr-body.mjs'), ...args], { cwd: directory, encoding: 'utf8', ...extra, env: { ...env, ...extra.env } })
  try {
    mkdirSync(join(directory, 'scripts')); mkdirSync(join(directory, '.github'))
    copyFileSync(new URL('./pr-body.mjs', import.meta.url), join(directory, 'scripts', 'pr-body.mjs'))
    copyFileSync(new URL('../.github/pull_request_template.md', import.meta.url), join(directory, '.github', 'pull_request_template.md'))
    git('init', '--initial-branch=main', '.'); git('add', '.'); git('commit', '-m', 'Baseline')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('switch', '-c', 'topic')
    mkdirSync(join(directory, 'public', 'octatrack-modules', 'mackity'), { recursive: true })
    writeFileSync(join(directory, mwrm[0]), 'package\n'); git('add', '.'); git('commit', '-m', 'Mackity')
    const unfinished = ready + edgeTable + '| Part/project reload | stored knob bytes | not run on the unit | not run |\n'
    writeFileSync(join(directory, 'body.md'), unfinished)
    const refused = run(['body.md'])
    expect(refused.status, refused.stderr).toBe(1)
    expect(refused.stdout).toContain('as a ready pull request: 1 file changed since origin/main, 1 that runs on an instrument.')
    expect(refused.stdout).toContain('✗ The edge-case table under "Edge cases" has a row still to finish: row "Part/project reload": the result says "not run" without why')
    expect(refused.stdout).toContain('CI\'s describe check would fail')
    // A draft needs no unit line yet but its edge cases; stdin and the caller's own directory work too.
    const draft = ready.replace(/\n\nTested on a unit:.*$/, '') + edgeTable + '| Part/project reload | stored knob bytes | not run on the unit | not run: needs a Keep and a power cycle |\n'
    expect(run(['-'], { input: draft }).status).toBe(1)
    const passed = run(['-', '--draft'], { input: draft })
    expect(passed.status, passed.stdout).toBe(0)
    expect(passed.stdout).toContain('Passes: CI\'s describe check reads it the same way.')
    mkdirSync(join(directory, 'notes')); writeFileSync(join(directory, 'notes', 'draft.md'), draft)
    expect(run(['draft.md', '--draft'], { env: { INIT_CWD: join(directory, 'notes') } }).status).toBe(0)
    // Against a base that already holds the package, nothing runs on an instrument.
    const since = run(['body.md', '--changed-since', 'topic'])
    expect(since.stdout).toContain('0 files changed since topic, none that runs on an instrument.')
    expect(since.status).toBe(0)
    // A base that cannot be read stops the check rather than passing it with no files.
    const unknown = run(['body.md', '--changed-since', 'nowhere/main'])
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('Could not list this branch\'s changes against nowhere/main')
    expect(run(['missing.md']).status).toBe(2)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 20_000)
