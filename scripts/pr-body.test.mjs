import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { bodyProblems } from './pr-body.mjs'

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')

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
  // A link to a guide is not an answer.
  expect(bodyProblems('Follows docs/module-guides/effects.md for the new reverb; checked with pr:ready and on an MKII.', template)).toEqual([expect.stringMatching(/^Say what the guides lacked/)])
})
