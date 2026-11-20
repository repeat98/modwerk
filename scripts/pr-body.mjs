// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Is the pull request described? Reviewers asked one module PR in nine to fill in its description, and half the merged PRs skipped the
// guides question AGENTS.md asks of every PR ("Fold what you learn back"). And does a ready one that changes what runs on an instrument
// name the exact build that ran on a unit? A base went up ready to merge after only development twins had run (#1694, 17 November 2026).
// And does it, draft or ready, list the edge cases the change risks, each with what it showed (docs/TEST_PROCEDURE.md, 20 November 2026)?
// Reads only the description, the template, the draft flag and the changed file names: no PR code runs.
//
//   PR_BODY="$(gh pr view <n> --json body --jq .body)" PR_DRAFT=false PR_FILES="$(gh pr diff <n> --name-only)" node scripts/pr-body.mjs
//   node scripts/pr-body.mjs FILE.md        # a description still in a file, before the pull request is open (as a ready one, with
//                                           # this branch's files against origin/main)
import { execFileSync } from 'node:child_process'
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

// What reaches an instrument: a built module package or a base (.mwrm, .elemod, or a Zoom .ZDL effect). Sources alone change nothing on a unit, and CI rebuilds
// the packages from them, so a source change that matters always carries a changed package.
export const INSTRUMENT = /\.(?:mwrm|elemod|zdl)$/i
/** The changed files that run on an instrument. */
export const instrumentFiles = files => (files ?? []).filter(file => INSTRUMENT.test(file))
// "Tested on a unit: base 8d1db124, MKII, …" names the build by a hash (a base identity or a package's sha256, 8 hex digits or more);
// "Not tested on a unit: <why>" says it plainly, for the owner to waive or not.
const TESTED = /^tested on (?:a|the|an?) (?:unit|instrument)\b[^:]*:.*\b[0-9a-f]{8,}\b/i
const UNTESTED = /^not tested on (?:a|the|an?) (?:unit|instrument)\b[^:]*:\s*\S/i
const plain = line => line.replaceAll('**', '').replaceAll('`', '').replace(/^(?:[-*]|#+)\s*/, '').trim()

// The edge cases the change risks (docs/TEST_PROCEDURE.md#edge-cases), under a line or heading "Edge cases": a table with one row a case,
// | Case | Why this change makes it a risk | How run | Result |, the result "pass", "fail: …" or "not run: why"; or "Edge cases: none,
// because …". A table under another heading does not count, nor the template's empty row.
const EDGE = /^edge cases?\b/i
const EDGE_NONE = /^edge cases?\b[^:]*:\s*none\b[\s,.;:–—-]*because\s+\S/i
const cells = row => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
/** true when the description lists its edge cases, else what is wrong; `own` tells the author's lines from the template's. */
export function edgeCases(lines, own) {
  let incomplete = null
  for (let index = 0; index < lines.length; index++) {
    if (!EDGE.test(plain(lines[index]))) continue
    if (own(lines[index]) && EDGE_NONE.test(plain(lines[index]))) return true
    let rows = 0
    for (const next of lines.slice(index + 1)) {
      if (!next.startsWith('|')) {
        if ((next && rows) || isHeading(next) || /^(?:[-*]\s+)?\*\*/.test(next)) break
        continue
      }
      const row = cells(next)
      if (!own(next) || row.every(cell => /^:?-*:?$/.test(cell)) || /^case$/i.test(row[0])) continue
      if (row.length < 4 || !row[0] || !row.at(-1) || /^not run\W*$/i.test(row.at(-1))) { incomplete ??= row[0] || next; continue }
      rows++
    }
    if (rows && !incomplete) return true
  }
  return incomplete ? 'incomplete' : 'missing'
}

/** What the description still lacks; [] when it is described, answers the guides question, and (ready, changing what runs on an
 * instrument) names the build that ran on a unit. A draft may still be in test, but lists its edge cases already. */
export function bodyProblems(body, template, { draft = false, files = [] } = {}) {
  const templateLines = new Set(template.split('\n').map(line => line.trim()).filter(Boolean))
  const isOwn = line => !!line && !templateLines.has(line) && !NOT_OWN.test(line)
  const lines = (body ?? '').split('\n').map(line => line.trim()), own = lines.filter(isOwn)
  const problems = []
  if (own.join(' ').length < OWN_TEXT) problems.push('Describe the change in your own words: what was wrong or hard, what this changes and how you checked it (the pull request template asks for each).')
  const instrument = instrumentFiles(files)
  if (!draft && instrument.length && !own.some(line => TESTED.test(plain(line)) || UNTESTED.test(plain(line)))) problems.push('This pull request changes what runs on an instrument (' + instrument.slice(0, 3).join(', ') + (instrument.length > 3 ? ` and ${instrument.length - 3} more` : '') + '). Keep it a draft until the exact build ran on a unit, then name it on a line of its own: "Tested on a unit: base 8d1db124 (or the package\'s sha256), MKII, what ran". If it cannot be tested, write "Not tested on a unit: <why>" for the owner to decide. `npm run pr:ready` saying Ready means the checks pass, not that it was tested.')
  // Drafts too: a draft opened early lists what it will run, each case "not run: why" until it ran (owner, 20 November 2026).
  const edge = instrument.length ? edgeCases(lines, isOwn) : true
  if (edge !== true) problems.push('This pull request changes what runs on an instrument, so it lists the edge cases this change risks and what each showed (docs/TEST_PROCEDURE.md#edge-cases). Under a line "Edge cases", add a table with one row a case: | Case | Why this change makes it a risk | How run | Result |, the result "pass", "fail: what happened" or "not run: why". `npm run test:procedure` writes the empty table. With none, say why: "Edge cases: none, because …".' +
    (edge === 'incomplete' ? ' A row there lacks its case or its result, or says "not run" without why.' : ''))
  if (!own.some((line, index) => answersGuides(line, own[index + 1]))) problems.push('Say what the guides lacked or got wrong while you did this, and where you fixed it, on a line of its own, for example "Guides: nothing". It is how the next developer\'s agent learns what you did (AGENTS.md, Pull requests).')
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')
  const local = !!process.argv[2]
  // In CI the workflow passes the draft flag and the file names; locally, a description in a file is checked as a ready pull request
  // of this branch against origin/main.
  let files = (process.env.PR_FILES ?? '').split('\n').map(file => file.trim()).filter(Boolean)
  if (local && !process.env.PR_FILES) {
    try { files = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean) } catch { files = [] }
  }
  const problems = bodyProblems(local ? readFileSync(process.argv[2], 'utf8') : process.env.PR_BODY, template,
    { draft: process.env.PR_DRAFT === 'true', files })
  for (const problem of problems) console.log('::error title=Pull request description::' + problem)
  console.log(problems.length ? 'Edit the pull request description (or keep it a draft); this check runs again when you save it or mark it ready.' : 'The description says what changed and answers the guides question.')
  process.exitCode = problems.length ? 1 : 0
}
