// Will this pull request merge without the owner's help? Run it before every push:
//
//   npm run pr:ready                        # any change: up to date, regenerated, every check green
//   npm run pr:ready -- --author <login>    # a registered author's update: also the bot's merge scope
//   npm run pr:ready -- --remote upstream   # the remote that holds Modwerk's main (default: upstream, else origin)
//
// It reads and writes only this checkout, plus the agent board's claims (docs/AGENT_BOARD.md): no push, no GitHub API.
// CI repeats the same checks against the PR's base, and the author-update bot runs the same scope inspection
// (scripts/author-update-git.mjs).
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const GENERATORS = [['licenses:generate'], ['machines:generate'], ['modules:generate'], ['modules:pairs', '--', '--write']]

// The checks that judge a module. A module pull request never edits them: a red check names the fix, and a wrong check is its own
// Fix: pull request (AGENTS.md, "Setup and checks"). A module release still carries its builder list, assets, comparisons and test lists.
const MODULE_FOLDER = /^sdk\/(?:octabam|digitakt|digitone|analog-rytm-mkii|analog-four-mkii)\/modules\/[^/]+\/|^sdk\/drafts\/[^/]+\//
const GATE = /^(?:\.github\/workflows\/|sdk\/machines\/octatrack\/compatibility\.json$|sdk\/tests\/test_(?:module_compat|module_pairs|dsp_source_gates)\.py$|scripts\/(?:modules|module-doctor|module-qualification|module-changelogs|perf-audit(?:-analysis)?|check|pr-ready|change-scope|author-update-git|pr-triage)\.mjs$|scripts\/(?:module-compat|module-pairs|dsp-source-gates)\.py$)/
/** The gate files a change edits while it also adds or changes a module; [] when it changes no module. */
export function gateEdits(files) {
  return files.some(file => MODULE_FOLDER.test(file)) ? files.filter(file => GATE.test(file)) : []
}

/** The verdict from what was found; every problem says what to do. */
export function readiness({ dirty = [], behind = false, remote = 'upstream', regenerated = [], checkPassed = true, author = null, scope = null, guideEdits = [], gateEdits = [], compiled = null, board = null }) {
  const problems = [...board?.problems ?? []], notes = [...board?.notes ?? []]
  if (gateEdits.length) problems.push('This pull request changes a module and also ' + gateEdits.join(', ') + ': a check that judges modules. A red check names the fix; never change the check to pass it. If the check itself is wrong, send the correction as its own Fix: pull request for the owner to review, and let the module wait for it.')
  if (dirty.length) problems.push('Commit or discard these changes first; only commits reach the PR: ' + dirty.join(', '))
  if (behind) problems.push(`Your branch does not contain current main. Merge it (git merge ${remote}/main), resolve any conflict, then run this again.`)
  if (regenerated.length) problems.push('The generated files were stale. They are regenerated now; commit them: ' + regenerated.join(', '))
  if (!checkPassed) problems.push('npm run check failed: fix every failure above; CI runs the same checks.')
  if (author) {
    if (scope?.error) problems.push(`This is not an automatic author update (${scope.error}). Keep the PR to your own module's folder and its changelog entry, or ask the owner for a review.`)
    else if (scope) notes.push('Automatic merge: the bot can merge this update to ' + scope.modules.join(', ') + ' once both release boxes are ticked and CI is green.')
  } else notes.push('Without --author this is a new module or a shared change: the owner reviews it and merges it with one click once CI is green.')
  // pr:ready has no toolchain, so it can only say which packages CI rebuilds in Docker and how to reproduce them first (DEVELOPER_WORKFLOW.md, "Compiled packages").
  if (compiled?.octatrack) notes.push('CI rebuilds the Octatrack packages (octatrack-source) and requires the committed ones to match. pr:ready cannot run that: before you push, reproduce them with bash scripts/build-modules-isolated.sh <clean checkout> <new dir> <image id> from a clean, committed tree ("Compiled packages" in docs/DEVELOPER_WORKFLOW.md).')
  if (compiled?.elemod) notes.push('CI rebuilds the Digitakt, Digitone, Rytm and Four packages (elemod-source) and requires the committed ones to match. pr:ready cannot run that: before you push, run bash scripts/build-elemod-isolated.sh and node scripts/verify-elemod-release-exports.mjs <dir> from a clean, committed tree ("Compiled packages" in docs/DEVELOPER_WORKFLOW.md).')
  // The guides are the context every later agent reads, so each PR says what they lacked or got wrong (AGENTS.md, "Fold what you learn back").
  notes.push('What did the guides lack or get wrong while you did this? ' + (guideEdits.length
    ? 'Guide edits on this branch: ' + guideEdits.join(', ') + '. Say in the PR what they fix.'
    : 'No guide edit is on this branch: fix it where a reader would look (docs/, AGENTS.md, the machine guide; for a module release, a separate Docs: PR), or write "nothing" in the PR.'))
  notes.push('Then push, open or update the PR, and watch it: gh pr checks <number> --watch. If main moves before the merge, run this again and push.')
  return { ok: problems.length === 0, problems, notes }
}

/** Claim on the agent board what this branch adds (a module, a hook or table index, a migration), so two developers never
 * take the same one. Someone else's claim stops Ready; an unreachable board is a note, never a stop. */
export async function boardClaims(root, base, board) {
  const needed = board.neededClaims({ root, base })
  if (!needed.length) return null
  const problems = [], notes = []
  let login, compared
  try { login = await board.whoami(); compared = await board.compareClaims(needed, login) } catch (error) {
    if (error instanceof board.BoardUnavailable) return { problems, notes: ['Board: claims not checked. ' + error.message + ' Run this again before you push once it answers.'] }
    throw error
  }
  for (const item of compared.others) problems.push(`${item.kind} ${item.key} (${item.why}) is claimed by ${board.describeClaim(item.claim)} on the agent board. Never work around a claim: ask them, or renumber or rename yours (docs/AGENT_BOARD.md).`)
  const open = [...compared.free, ...compared.unknown, ...compared.mine]
  if (!login && open.length) problems.push('This branch adds ' + open.map(item => item.kind + ' ' + item.key).join(', ') + ', which need your claim on the agent board. Sign in once with npm run board -- login, then run this again.')
  else for (const item of open) {
    try {
      const result = await board.claim({ kind: item.kind, key: item.key, branch: board.currentBranch(root) })
      notes.push((result.renewed ? 'Board: renewed your claim on ' : 'Board: claimed ') + item.kind + ' ' + item.key + ' for @' + login + '.')
    } catch (error) {
      if (error instanceof board.BoardUnavailable) { notes.push('Board: could not claim ' + item.kind + ' ' + item.key + '. ' + error.message); continue }
      problems.push('Board: ' + item.kind + ' ' + item.key + ': ' + error.message)
    }
  }
  return { problems, notes }
}

async function main(argv) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
  const option = name => { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1] }
  const remotes = git('remote').split('\n')
  const remote = option('--remote') ?? (remotes.includes('upstream') ? 'upstream' : 'origin')
  const author = option('--author')?.replace(/^@/, '') ?? null
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Run this through npm run pr:ready.')
  const npm = (...args) => spawnSync(process.execPath, [npmCli, 'run', ...args], { cwd: root, stdio: 'inherit' }).status === 0
  const tracked = () => git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).map(line => line.slice(3))

  console.log(`Fetching ${remote}/main`)
  // A single-branch clone may fetch main only into FETCH_HEAD. Update the
  // tracking ref too, so the suggested `git merge <remote>/main` is useful.
  git('fetch', '--no-tags', remote, `refs/heads/main:refs/remotes/${remote}/main`)
  const base = git('rev-parse', 'FETCH_HEAD'), head = git('rev-parse', 'HEAD')
  const dirty = tracked()
  let behind = false
  try { git('merge-base', '--is-ancestor', base, head) } catch { behind = true }
  // Each step runs only when the ones before it passed, so the first problem is the one to fix.
  let regenerated = [], checkPassed = true, scope = null
  if (!dirty.length && !behind) {
    for (const args of GENERATORS) if (!npm(...args)) throw new Error('npm run ' + args.join(' ') + ' failed')
    regenerated = tracked()
    if (!regenerated.length) checkPassed = npm('check', '--', '--base', base)
  }
  if (author && !behind) scope = await authorScope(root, git, base, head, author)
  const changed = git('diff', '--name-only', base + '...' + head).split('\n').filter(Boolean)
  const guideEdits = changed.filter(file => /^(?:AGENTS\.md|sdk\/AGENTS\.md|docs\/|sdk\/machines\/[^/]+\/README\.md$)/.test(file))
  let compiled = null
  if (!dirty.length && !behind) {
    const { readChangeScope } = await import('./change-scope.mjs')
    const changes = readChangeScope({ root, base, head })
    compiled = { octatrack: changes.modules, elemod: changes.elemod }
  }
  const board = !dirty.length && !behind ? await boardClaims(root, base, await import('./agent-board.mjs')) : null
  const verdict = readiness({ dirty, behind, remote, regenerated, checkPassed, author, scope, guideEdits, gateEdits: gateEdits(changed), compiled, board })
  console.log('')
  for (const line of verdict.problems) console.log('✗ ' + line)
  for (const line of verdict.notes) console.log('· ' + line)
  console.log(verdict.ok ? 'Ready: this PR can merge without the owner repairing it.' : 'Not ready yet.')
  return verdict.ok ? 0 : 1
}

async function authorScope(root, git, base, head, login) {
  const { inspectAuthorUpdate } = await import('./author-update-git.mjs')
  const registry = JSON.parse(git('show', base + ':.github/module-authors.json'))
  const id = registry.accounts?.[login.toLowerCase()]
  if (!id) return { error: login + ' is not in .github/module-authors.json on main' }
  try { return inspectAuthorUpdate(root, base, head, { login, id, type: 'User' }) }
  catch (error) { return { error: error.message } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
