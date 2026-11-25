// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Is the pull request described? Reviewers asked one module PR in nine to fill in its description, and half the merged PRs skipped the
// guides question AGENTS.md asks of every PR ("Fold what you learn back"). And does a ready one that changes what runs on an instrument
// name the exact build that ran on a unit? A base went up ready to merge after only development twins had run (#1694, 17 November 2026).
// And does it, draft or ready, list the edge cases the change risks, each with what it showed (docs/TEST_PROCEDURE.md, 20 November 2026)?
// Reads only the description, the template, the draft flag and the changed file names: no PR code runs.
//
//   PR_BODY="$(gh pr view <n> --json body --jq .body)" PR_DRAFT=false PR_FILES="$(gh pr diff <n> --name-only)" node scripts/pr-body.mjs
//   npm run pr:body -- FILE.md              # a description in a file, before you open or edit the pull request: as a ready one, with
//                                           # this branch's files against upstream/main, or origin/main without that remote
//   npm run pr:body -- FILE.md --draft --changed-since base/octatrack-next   # as a draft, into another base; FILE - reads stdin
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
const EDGE_BARE_NONE = /^edge cases?\b[^:]*:\s*none\b/i
const cells = row => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
const ROW_SHAPE = '| Case | Why this change makes it a risk | How run | Result |'
/** Why a row of the edge-case table is not a finished case, or null; `row` is its cells. */
export function rowProblem(row) {
  if (row.length < 4) return `it has ${row.length} cell${row.length === 1 ? '' : 's'}, and a case has four: ${ROW_SHAPE}`
  if (!row[0]) return 'its first cell, the case, is empty'
  if (!row.at(-1)) return 'its last cell, the result, is empty; write "pass", "fail: what happened" or "not run: why"'
  if (/^not run\W*$/i.test(row.at(-1))) return `the result says "${row.at(-1)}" without why; write "not run: <why>"`
  return null
}
/** What the edge cases say: `verdict` true when listed, else 'missing' or 'incomplete'; `rows` the unfinished rows ({ row, why })
 * and `hint` why nothing counted. `own` tells the author's lines from the template's. */
export function edgeCaseFindings(lines, own) {
  const unfinished = new Map()
  let sections = 0, bareNone = false
  for (let index = 0; index < lines.length; index++) {
    if (!EDGE.test(plain(lines[index]))) continue
    sections++
    if (own(lines[index]) && EDGE_NONE.test(plain(lines[index]))) return { verdict: true, rows: [], hint: null }
    if (own(lines[index]) && EDGE_BARE_NONE.test(plain(lines[index]))) bareNone = true
    let rows = 0
    for (let at = index + 1; at < lines.length; at++) {
      const next = lines[at]
      if (!next.startsWith('|')) {
        if ((next && rows) || isHeading(next) || /^(?:[-*]\s+)?\*\*/.test(next)) break
        continue
      }
      const row = cells(next)
      if (!own(next) || row.every(cell => /^:?-*:?$/.test(cell)) || /^case$/i.test(row[0])) continue
      const why = rowProblem(row)
      if (why) { unfinished.set(at, { row: row[0] || next, why }); continue }
      rows++
    }
    if (rows && !unfinished.size) return { verdict: true, rows: [], hint: null }
  }
  if (unfinished.size) return { verdict: 'incomplete', rows: [...unfinished.values()], hint: null }
  return { verdict: 'missing', rows: [], hint: bareNone ? 'It says "none" without why: write "Edge cases: none, because …".'
    : sections ? 'Under "Edge cases" no table row with its case and result follows before the next heading or bold line.'
      : 'No line or heading "Edge cases" was found.' }
}
/** true when the description lists its edge cases, else 'missing' or 'incomplete'; `own` tells the author's lines from the template's. */
export const edgeCases = (lines, own) => edgeCaseFindings(lines, own).verdict
const quoteRow = row => '"' + (row.length > 60 ? row.slice(0, 57) + '…' : row) + '"'

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
  const edge = instrument.length ? edgeCaseFindings(lines, isOwn) : { verdict: true }
  // An unfinished row is named with what it lacks, so the fix needs no reading of this file (#2148, 25 November 2026).
  if (edge.verdict === 'incomplete') problems.push('The edge-case table under "Edge cases" has ' + (edge.rows.length === 1 ? 'a row' : edge.rows.length + ' rows') + ' still to finish: ' +
    edge.rows.map(({ row, why }) => `row ${quoteRow(row)}: ${why}`).join('; ') + '. Each case is a row ' + ROW_SHAPE + ', the result "pass", "fail: what happened" or "not run: why" (docs/TEST_PROCEDURE.md#edge-cases).')
  else if (edge.verdict !== true) problems.push('This pull request changes what runs on an instrument, so it lists the edge cases this change risks and what each showed (docs/TEST_PROCEDURE.md#edge-cases). ' + edge.hint + ' Under a line "Edge cases", add a table with one row a case: ' + ROW_SHAPE + ', the result "pass", "fail: what happened" or "not run: why". `npm run test:procedure` writes the empty table. With none, say why: "Edge cases: none, because …".')
  if (!own.some((line, index) => answersGuides(line, own[index + 1]))) problems.push('Say what the guides lacked or got wrong while you did this, and where you fixed it, on a line of its own, for example "Guides: nothing". It is how the next developer\'s agent learns what you did (AGENTS.md, Pull requests).')
  return problems
}

/** bodyProblems against this checkout's pull request template, as CI's describe check reads it. */
export function descriptionProblems(body, options) {
  return bodyProblems(body, readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8'), options)
}

/** The local command line: FILE (or - for stdin), --draft, --changed-since <ref>; { error } when it cannot be read. */
export function parseArgs(argv) {
  const options = { file: null, draft: false, since: null }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--draft') options.draft = true
    else if (arg === '--changed-since') {
      options.since = argv[++index]
      if (!options.since || options.since.startsWith('--')) return { error: '--changed-since needs a ref, such as origin/main or base/octatrack-next.' }
    } else if (arg.startsWith('--')) return { error: 'Unknown option ' + arg + '.' }
    else if (options.file) return { error: 'One description file at a time.' }
    else options.file = arg
  }
  return options.file ? options : { error: 'Name the description file (or - to read it from stdin).' }
}

/** The base a local check compares the branch with: the ref given, else upstream/main in a fork's checkout, whose origin/main is the
 * fork's own and can lag by hundreds of files, else origin/main (as scripts/lane.mjs picks it). */
export const localBase = (since, remotes) => since ?? (remotes.includes('upstream') ? 'upstream/main' : 'origin/main')

/** A description file named on the command line: - is stdin, and a relative path is the caller's, since npm run starts in the root. */
export const readDescription = (file, cwd = process.env.INIT_CWD ?? process.cwd()) => readFileSync(file === '-' ? 0 : resolve(cwd, file), 'utf8')

/** The branch's changed files as CI lists them: git diff --name-only --no-renames <base>...HEAD (.github/workflows/pr-description.yml). */
export function changedFiles(git, base) {
  return git('diff', '--name-only', '--no-renames', base + '...HEAD').split('\n').map(file => file.trim()).filter(Boolean)
}

const USAGE = 'Usage: npm run pr:body -- FILE [--draft] [--changed-since <ref>]   (FILE - reads stdin)'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ci = process.argv.length <= 2
  if (ci) {
    // In CI the workflow passes the description, the draft flag and the changed files.
    const files = (process.env.PR_FILES ?? '').split('\n').map(file => file.trim()).filter(Boolean)
    const problems = descriptionProblems(process.env.PR_BODY, { draft: process.env.PR_DRAFT === 'true', files })
    for (const problem of problems) console.log('::error title=Pull request description::' + problem)
    console.log(problems.length ? 'Edit the pull request description (or keep it a draft); this check runs again when you save it or mark it ready.' : 'The description says what changed and answers the guides question.')
    process.exitCode = problems.length ? 1 : 0
  } else {
    // Locally, a description in a file is checked as CI would check it on this branch's pull request: ready unless --draft, with the
    // files this branch changes against the base it merges into (PR_FILES, when set, stands in for them).
    const options = parseArgs(process.argv.slice(2))
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    let body, files, base = null
    try {
      if (options.error) throw new Error(options.error + '\n' + USAGE)
      body = readDescription(options.file)
      if (process.env.PR_FILES) files = process.env.PR_FILES.split('\n').map(file => file.trim()).filter(Boolean)
      else {
        base = localBase(options.since, git('remote').split('\n'))
        try { files = changedFiles(git, base) } catch (error) {
          throw new Error(`Could not list this branch's changes against ${base}: ${(error.stderr || error.message).trim().split('\n').pop()}. Fetch it (git fetch) or name the base the pull request merges into with --changed-since <ref>.`, { cause: error })
        }
      }
    } catch (error) { console.error(error.message); process.exit(2) }
    const instrument = instrumentFiles(files)
    console.log(`Checking ${options.file === '-' ? 'the description' : options.file} as a ${options.draft ? 'draft' : 'ready'} pull request: ${files.length} file${files.length === 1 ? '' : 's'} changed` +
      (base ? ` since ${base}` : ' (PR_FILES)') + (instrument.length ? `, ${instrument.length} that run${instrument.length === 1 ? 's' : ''} on an instrument.` : ', none that runs on an instrument.'))
    const problems = descriptionProblems(body, { draft: options.draft, files })
    for (const problem of problems) console.log('✗ ' + problem)
    console.log(problems.length ? 'Not yet: CI\'s describe check would fail on the same description.' : 'Passes: CI\'s describe check reads it the same way.')
    process.exitCode = problems.length ? 1 : 0
  }
}
