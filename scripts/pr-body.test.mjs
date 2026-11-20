import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { bodyProblems } from './pr-body.mjs'

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')

it('makes the description part of the required PR verdict on pushes, edits and draft transitions', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/module-pr.yml', import.meta.url), 'utf8'))
  expect(workflow.jobs['module-pr-ok'].needs).toContain('describe')
  expect(workflow.on.pull_request.types).toEqual(expect.arrayContaining(['opened', 'synchronize', 'edited', 'converted_to_draft', 'ready_for_review', 'reopened']))
})

it('checks the description of a pull request into a cumulative base draft too, and nothing else there', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/module-pr.yml', import.meta.url), 'utf8'))
  expect(workflow.on.pull_request.branches).toContain('base/*-next')
  expect(workflow.jobs.describe.if).toMatch(/github\.base_ref == 'main'/)
  expect(workflow.jobs.describe.if).toMatch(/startsWith\(github\.base_ref, 'base\/'\) && endsWith\(github\.base_ref, '-next'\)/)
  // Every other job hangs off scope, which a pull request into base/ skips; the verdict counts skipped as passed.
  expect(workflow.jobs.scope.if).toMatch(/!startsWith\(github\.base_ref, 'base\/'\)/)
  for (const [name, job] of Object.entries(workflow.jobs)) if (!['scope', 'describe', 'module-pr-ok'].includes(name)) expect([job.needs].flat(), name).toContain('scope')
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
  const incomplete = expect.stringMatching(/lacks its case or its result/)
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
