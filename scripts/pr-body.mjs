// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Is the pull request described? Reviewers asked one module PR in nine to fill in its description, and half the merged PRs skipped the
// guides question AGENTS.md asks of every PR ("Fold what you learn back"). Reads only the description and the template: no PR code runs.
//
//   PR_BODY="$(gh pr view <n> --json body --jq .body)" node scripts/pr-body.mjs
//   node scripts/pr-body.mjs FILE.md        # a description still in a file, before the pull request is open
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const OWN_TEXT = 40
// Lines that carry no description: ticked or open boxes, HTML comments and the attribution an agent adds.
const NOT_OWN = /^(?:[-*] \[[ xX]\]|<!--|🤖 Generated with|Co-Authored-By:)/

// The guides answer: a line that starts with the question or "Guides" and answers it after a colon, or a heading followed by the answer,
// or the question ending in its colon with the answer as a list below it (#1552 was refused for that).
const GUIDES = /^(?:what )?(?:the )?guides?\b/i
// A Markdown heading, or a line that is all bold, which many write as a heading.
const isHeading = line => /^#/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line)
function answersGuides(line, next) {
  // Bold first: the list-marker strip would otherwise eat one star of a leading "**".
  const text = line.replaceAll('**', '').replace(/^(?:[-*]|#+)\s*/, '').trim()
  if (!GUIDES.test(text)) return false
  const open = value => /:$/.test(value.replaceAll('**', '').trim()) // a question left open, this one or the next
  return /:\s*\S/.test(text) || ((isHeading(line) || open(line)) && !!next && !isHeading(next) && !open(next))
}

/** What the description still lacks; [] when it is described and answers the guides question. */
export function bodyProblems(body, template) {
  const templateLines = new Set(template.split('\n').map(line => line.trim()).filter(Boolean))
  const own = (body ?? '').split('\n').map(line => line.trim()).filter(line => line && !templateLines.has(line) && !NOT_OWN.test(line))
  const problems = []
  if (own.join(' ').length < OWN_TEXT) problems.push('Describe the change in your own words: what was wrong or hard, what this changes and how you checked it (the pull request template asks for each).')
  if (!own.some((line, index) => answersGuides(line, own[index + 1]))) problems.push('Say what the guides lacked or got wrong while you did this, and where you fixed it, on a line of its own, for example "Guides: nothing". It is how the next developer\'s agent learns what you did (AGENTS.md, Pull requests).')
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')
  const problems = bodyProblems(process.argv[2] ? readFileSync(process.argv[2], 'utf8') : process.env.PR_BODY, template)
  for (const problem of problems) console.log('::error title=Pull request description::' + problem)
  console.log(problems.length ? 'Edit the pull request description; this check runs again when you save it.' : 'The description says what changed and answers the guides question.')
  process.exitCode = problems.length ? 1 : 0
}
