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
  const described = 'Octatrack base 0.7.8: a module that no track uses rests out of the per-frame hooks; checked with pr:ready.\n\nGuides: HOOKS.md.'
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
