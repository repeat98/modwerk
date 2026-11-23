// Will this pull request merge without the owner's help? Run it before every push:
//
//   npm run pr:ready                        # any change: up to date, regenerated, every check green
//   npm run pr:ready -- --commit "Message"  # check a fully staged change once, commit it, then finish the PR checks
//   npm run pr:ready -- --author <login>    # a registered author's update: also the bot's merge scope
//   npm run pr:ready -- --remote upstream   # the remote that holds Modwerk's main (default: upstream, else origin)
//
// It reads and writes only this checkout, plus the agent board's claims and inbox (docs/AGENT_BOARD.md): no push, no GitHub API.
// CI repeats the same checks against the PR's base, and the author-update bot runs the same scope inspection
// (scripts/author-update-git.mjs).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { alternation, moduleFolders } from './machine-folders.mjs'
import { instrumentFiles } from './pr-body.mjs'

const GENERATORS = [['licenses:generate'], ['machines:generate'], ['modules:generate']]

// The checks that judge a module. A module pull request never edits them: a red check names the fix, and a wrong check is its own
// Fix: pull request (AGENTS.md, "Setup and checks"). A module release still carries its builder list, assets, comparisons and test lists.
const MODULE_FOLDER = new RegExp(`^sdk\\/(?:${alternation(moduleFolders())})\\/modules\\/[^/]+\\/|^sdk\\/drafts\\/[^/]+\\/`)
const GATE = /^(?:\.github\/workflows\/|sdk\/machines\/octatrack\/compatibility\.json$|sdk\/tests\/test_(?:module_compat|module_pairs|dsp_source_gates|dsp_register_contract)\.py$|scripts\/(?:modules|module-doctor|module-cpu-price|module-qualification|module-changelogs|perf-audit(?:-analysis)?|check|pr-ready|pr-check-plan|change-scope|machine-folders|author-update-git|pr-triage)\.mjs$|scripts\/(?:module-compat|module-pairs|dsp-source-gates|dsp-register-contract)\.py$)/
/** The gate files a change edits while it also adds or changes a module; [] when it changes no module. */
export function gateEdits(files) {
  return files.some(file => MODULE_FOLDER.test(file)) ? files.filter(file => GATE.test(file)) : []
}

// The base: its hooks and tables, the shared services and adapter code, its loader and the committed base image. Base changes go directly onto the
// machine’s cumulative owner-reviewed draft, merged before a module uses it (docs/module-guides/README.md#propose-a-hook). The per-module recipe
// files beside the adapters (*.json, *.py) are a module's own and stay in its pull request.
const BASE = /^(?:sdk\/machines\/[^/]+\/(?:events\.json$|site-events\.json$|dsp-sites\.json$|base-binding\.json$|HOOKS\.md$|include\/|elekloader\/|module-adapters\/[^/]+\.(?:c|h|cpp|s)$)|src\/engine\/assets\/[a-z0-9-]+-base(?:[.-]|$))/
/** The base files a change edits while it also adds or changes a module; [] when it changes no module. */
export function baseEdits(files) {
  return files.some(file => MODULE_FOLDER.test(file)) ? files.filter(file => BASE.test(file)) : []
}

// CI refuses both in contributors' module pull requests opened from this day; earlier ones and the owner's are judged in review.
export const MODULE_SCOPE_REQUIRED_FROM = '2026-11-09'
/** CI's refusals for one pull request: [] for the owner's, for one opened before MODULE_SCOPE_REQUIRED_FROM, or for one in scope. */
export function moduleScopeProblems(files, { author = null, owner = null, openedAt = null } = {}) {
  if (!author || author.toLowerCase() === owner?.toLowerCase() || (openedAt ?? '').slice(0, 10) < MODULE_SCOPE_REQUIRED_FROM) return []
  const problems = [], gates = gateEdits(files), base = baseEdits(files)
  if (gates.length) problems.push(gateProblem(gates))
  if (base.length) problems.push(baseProblem(base))
  return problems
}
const gateProblem = files => 'This pull request changes a module and also ' + files.join(', ') + ': a check that judges modules. A red check names the fix; never change the check to pass it. If the check itself is wrong, send the correction as its own Fix: pull request for the owner to review, and let the module wait for it.'
const baseProblem = files => 'This pull request changes a module and also the base: ' + files.join(', ') + '. Add the base commits directly to the machine’s base/<machine>-next branch and update its cumulative draft (docs/DEVELOPER_WORKFLOW.md#change-a-base). Resume the module on main once that draft has shipped.'

/** Why the checks cannot run on this Python, or null. npm run check runs the module gates in Python 3.10+: an older python3
 * (macOS's own is 3.9) crashes inside scripts/module-compat.py while it loads the Octatrack manifests, with no word on why. */
export function pythonProblem({ command = 'python3', version = null, error = null } = {}) {
  const [major, minor] = (version ?? '').split('.').map(Number)
  if (!error && (major > 3 || (major === 3 && minor >= 10))) return null
  const found = error ? `${command} did not run (${error})` : `${command} is ${version || 'an unknown version'}`
  return `npm run check needs Python 3.10 or newer, and ${found}. Install Python 3.10+ and put it first on PATH, then run this again.`
}

/** pythonProblem for the interpreter the gates call (scripts/modules.mjs): python3, or python on Windows. */
export function localPythonProblem(root) {
  const command = process.platform === 'win32' ? 'python' : 'python3'
  const probe = spawnSync(command, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'], { cwd: root, encoding: 'utf8' })
  return pythonProblem({ command, version: probe.stdout?.trim() || null, error: probe.error?.message ?? (probe.status ? (probe.stderr || '').trim().split('\n').pop() || 'exit ' + probe.status : null) })
}

/** Merges main into a clean branch that lacks it. A conflict is aborted, leaving the branch as it was, and its files are returned. */
export function mergeMain(git, ref) {
  try {
    git('merge', '--no-edit', ref)
    return { merged: true, conflicts: [] }
  } catch {
    const conflicts = (() => { try { return git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean) } catch { return [] } })()
    try { git('merge', '--abort') } catch { /* nothing started */ }
    return { merged: false, conflicts }
  }
}

/** The verdict from what was found; every problem says what to do. */
export function readiness({ python = null, dirty = [], behind = false, remote = 'upstream', regenerated = [], checkPassed = true, author = null, scope = null, guideEdits = [], gateEdits = [], baseEdits = [], instrument = [], baseDraft = instrument.some(file => BASE.test(file)), compiled = null, board = null, conflicts = [], draftOnly = false }) {
  const problems = [...board?.problems ?? []], notes = [...board?.notes ?? []]
  if (python) problems.push(python)
  if (gateEdits.length) problems.push(gateProblem(gateEdits))
  if (baseEdits.length) problems.push(baseProblem(baseEdits))
  if (dirty.length) problems.push('Commit or discard these changes first; only commits reach the PR: ' + dirty.join(', '))
  if (behind) problems.push(conflicts.length
    ? `Merging current main conflicts in ${conflicts.join(', ')}. Run git merge ${remote}/main, resolve them, commit, then run this again.`
    : `Your branch does not contain current main. Merge it (git merge ${remote}/main), resolve any conflict, then run this again.`)
  if (regenerated.length) problems.push('The generated files were stale. They are regenerated now; commit them: ' + regenerated.join(', '))
  if (!checkPassed) problems.push('npm run check failed: fix every failure above; CI runs the same checks.')
  if (author) {
    if (scope?.error) problems.push(`This is not an automatic author update (${scope.error}). Keep the PR to your own module's folder and its changelog entry, or ask the owner for a review.`)
    else if (scope) notes.push('Automatic merge: the bot can merge this update to ' + scope.modules.join(', ') + ' once both release boxes are ticked and CI is green.')
  } else if (!baseDraft) notes.push('For a first release, ask a device reviewer or repository maintainer to review and merge once CI is green. Shared changes go to a maintainer.')
  // pr:ready has no toolchain, so it can only say which packages CI rebuilds in Docker and how to reproduce them first (DEVELOPER_WORKFLOW.md, "Compiled packages").
  if (compiled?.octatrack) notes.push('CI rebuilds the Octatrack packages (octatrack-source) and requires the committed ones to match. pr:ready cannot run that: before you push, reproduce them with bash scripts/build-modules-isolated.sh <clean checkout> <new dir> <image id> from a clean, committed tree ("Compiled packages" in docs/DEVELOPER_WORKFLOW.md).')
  if (compiled?.elemod) notes.push('CI rebuilds the Digitakt, Digitone, Rytm and Four packages (elemod-source) and requires the committed ones to match. pr:ready cannot run that: before you push, run bash scripts/build-elemod-isolated.sh and node scripts/verify-elemod-release-exports.mjs <dir> from a clean, committed tree ("Compiled packages" in docs/DEVELOPER_WORKFLOW.md).')
  // The guides are the context every later agent reads, so each PR says what they lacked or got wrong (AGENTS.md, "Fold what you learn back").
  notes.push('What did the guides lack or get wrong while you did this? ' + (guideEdits.length
    ? 'Guide edits on this branch: ' + guideEdits.join(', ') + '. Say in the PR what they fix. If a developer working now could hit it before this merges, post it on the agent board yourself: npm run board -- finding <topic> <key> "…" --pr <n>.'
    : 'No guide edit is on this branch: fix it where a reader would look (docs/, AGENTS.md, the machine guide; for a module release, a separate Docs: PR), or write "nothing" in the PR.'))
  // Ready means the checks pass, not that anything ran on a unit (#1694 went up ready to merge after only development twins had).
  if (baseDraft) notes.push('Add these base commits directly to base/<machine>-next and update its cumulative draft. Start the machine’s cumulative draft only if none is open. Record the exact build and unit results there. The owner marks it ready after extensive hardware testing (docs/DEVELOPER_WORKFLOW.md#change-a-base).')
  else if (instrument.length) notes.push('This changes what runs on an instrument (' + instrument.slice(0, 3).join(', ') + (instrument.length > 3 ? ` and ${instrument.length - 3} more` : '') +
    '): open the pull request as a draft (gh pr create --draft) and mark it ready only after the developer has tested the exact build on a unit. The description then names it on a line of its own ("Tested on a unit: base 8d1db124 (or the package\'s sha256), MKII, what ran", or "Not tested on a unit: <why>" for the owner to decide); CI refuses a ready one without it. Until then, pr:ready -- --draft and the draft\'s CI list missing qualification, captures or approval as warnings.')
  if (baseDraft) notes.push('Watch the existing cumulative draft’s checks with gh pr checks <number> --watch. If main moves before the merge, run this again.')
  else {
    notes.push('Push and open or update the PR using the description template. Check the description locally with node scripts/pr-body.mjs FILE.md.')
    if (!draftOnly && !problems.length) notes.push('Once the work and testing are complete, run gh pr view <URL> --json state,headRefOid,isDraft. On the checked commit, run gh pr ready <URL> if it is a draft. Read the state again and verify isDraft is false before reporting it ready.')
    notes.push('Watch gh pr checks <URL> --watch until green. If main moves before the merge, run this again and push.')
  }
  return { ok: problems.length === 0, problems, notes, instrument: instrument.length > 0, baseDraft }
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
  for (const item of compared.others) problems.push(`${item.kind} ${item.key} (${item.why}) is claimed by ${board.describeClaim(item.claim)} on the agent board. Never work around a claim: ask them yourself (npm run board -- ask ${item.kind} ${item.key} "…"), or renumber or rename yours (docs/AGENT_BOARD.md).`)
  const open = [...compared.free, ...compared.unknown, ...compared.mine]
  if (!login && open.length) problems.push('This branch adds ' + open.map(item => item.kind + ' ' + item.key).join(', ') + ', which need your claim on the agent board. Sign in once with npm run board -- login, then run this again.')
  else for (const item of open) {
    try {
      // A claim says what the work is; a note its holder wrote by hand stays, and one the server refuses never costs the claim.
      const request = { kind: item.kind, key: item.key, branch: board.currentBranch(root) }, note = item.claim?.note ? '' : item.note
      const result = note ? await board.claim({ ...request, note }).catch(error => { if (error instanceof board.BoardError && error.status === 400) return board.claim(request); throw error }) : await board.claim(request)
      notes.push((result.renewed ? 'Board: renewed your claim on ' : 'Board: claimed ') + item.kind + ' ' + item.key + ' for @' + login + '.')
    } catch (error) {
      if (error instanceof board.BoardUnavailable) { notes.push('Board: could not claim ' + item.kind + ' ' + item.key + '. ' + error.message); continue }
      problems.push('Board: ' + item.kind + ' ' + item.key + ': ' + error.message)
    }
  }
  return { problems, notes }
}

/** Run the full check before committing, then bind its result to the tree Git actually committed. */
export function checkAndCommit(root, git, message, check) {
  const branch = git('branch', '--show-current'), parent = git('rev-parse', 'HEAD')
  if (!branch || branch === 'main') throw new Error('--commit needs a checked-out topic branch.')
  const inProgress = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']
  if (inProgress.some(name => existsSync(resolve(root, git('rev-parse', '--git-path', name))))) {
    throw new Error('Finish the Git operation in progress before using --commit.')
  }
  const stagedTree = () => {
    const status = git('status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--ignore-submodules=none')
    if (!status || status.split('\0').filter(Boolean).some(entry => entry[1] !== ' ')) {
      throw new Error('--commit needs a fully staged change. Review git status and stage the files you intend to commit.')
    }
    return git('write-tree')
  }
  const tree = stagedTree()
  if (!check()) return false
  if (git('branch', '--show-current') !== branch || git('rev-parse', 'HEAD') !== parent || stagedTree() !== tree) {
    throw new Error('The branch, HEAD or staged files changed during the check. Review git status and run pr:ready again.')
  }
  console.log(git('commit', '-m', message))
  if (git('branch', '--show-current') !== branch || git('show', '-s', '--format=%T %P', 'HEAD') !== tree + ' ' + parent) {
    throw new Error('The resulting commit differs from the checked tree or parent. Inspect the commit and run pr:ready again.')
  }
  return true
}

async function main(argv) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
  const option = name => { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1] }
  const remotes = git('remote').split('\n')
  const remote = option('--remote') ?? (remotes.includes('upstream') ? 'upstream' : 'origin')
  const author = option('--author')?.replace(/^@/, '') ?? null
  const commit = option('--commit')
  // --draft: the pull request stays a draft until the exact build ran on a unit, so missing release evidence warns (scripts/modules.mjs).
  if (argv.includes('--draft')) process.env.MODWERK_EVIDENCE_PENDING = '1'
  if (argv.includes('--commit') && (!commit?.trim() || commit.startsWith('--'))) throw new Error('--commit needs a commit message.')
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Run this through npm run pr:ready.')
  const npm = (...args) => spawnSync(process.execPath, [npmCli, 'run', ...args], { cwd: root, stdio: 'inherit' }).status === 0
  const changedFiles = () => git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map(line => line.slice(3))

  console.log(`Fetching ${remote}/main`)
  // A single-branch clone may fetch main only into FETCH_HEAD. Update the
  // tracking ref too, so the suggested `git merge <remote>/main` is useful.
  git('fetch', '--no-tags', remote, `refs/heads/main:refs/remotes/${remote}/main`)
  const base = git('rev-parse', 'FETCH_HEAD')
  let head = git('rev-parse', 'HEAD'), dirty = changedFiles()
  let behind = false
  try { git('merge-base', '--is-ancestor', base, head) } catch { behind = true }
  // A clean branch takes current main here rather than stopping, and a main that moves during the run needs no second run: the
  // PR's CI checks the merge with the newest main. A conflict stays the developer's to resolve.
  let conflicts = []
  if (behind && !dirty.length) {
    const merge = mergeMain(git, `${remote}/main`)
    if (merge.merged) { head = git('rev-parse', 'HEAD'); behind = false; console.log(`Merged current ${remote}/main into this branch.`) }
    conflicts = merge.conflicts
  }
  const python = localPythonProblem(root)
  // Assign before the expensive check. Ignored replay files leave the staged tree unchanged.
  const eligible = commit ? dirty.length && !git('ls-files', '--others', '--exclude-standard') && !git('diff', '--name-only') : !dirty.length && head !== base
  if (!python && !behind && eligible) {
    const { localReplay } = await import('./agent-eval/run.mjs')
    const tree = commit ? git('write-tree') : git('rev-parse', 'HEAD^{tree}')
    if (!localReplay(tree, remote, option('--eval-agent'))) return 2
  }
  // Each step runs only when the ones before it passed, so the first problem is the one to fix.
  let regenerated = [], checkPassed = true, scope = null
  const check = () => npm('check', '--', '--base', base)
  if (commit && !python && !behind) {
    if (!checkAndCommit(root, git, commit, check)) {
      console.error('The full check failed. Fix the failure before committing.')
      return 1
    }
    head = git('rev-parse', 'HEAD')
    dirty = changedFiles()
    // The board checks additions by commit. Run that gate on the new HEAD before the usual author and PR checks.
    checkPassed = npm('board', '--', 'check', '--base', base)
  } else if (!python && !dirty.length && !behind) {
    // A passing check proved every generated file current, so the generators run only after a failure: stale files are then
    // the first problem to fix, and the next run checks the rest. A generator that fails leaves the check's own report.
    checkPassed = check()
    if (!checkPassed) {
      for (const args of GENERATORS) if (!npm(...args)) break
      regenerated = changedFiles()
      if (regenerated.length) checkPassed = true
    }
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
  // The agent board: claim what the branch adds, and say what waits in the developer's board inbox.
  const boardModule = !dirty.length && !behind ? await import('./agent-board.mjs') : null
  const claimed = boardModule && await boardClaims(root, base, boardModule), waiting = boardModule ? await boardModule.inboxNotes() : []
  const board = claimed || waiting.length ? { problems: claimed?.problems ?? [], notes: [...claimed?.notes ?? [], ...waiting] } : null
  const baseDraft = changed.some(file => BASE.test(file)) || /^base\/[^/]+-next$/.test(git('branch', '--show-current'))
  const draftOnly = process.env.MODWERK_EVIDENCE_PENDING === '1'
  const verdict = readiness({ python, baseDraft, draftOnly, dirty, behind, conflicts, remote, regenerated, checkPassed, author, scope, guideEdits, gateEdits: gateEdits(changed), baseEdits: baseEdits(changed), instrument: instrumentFiles(changed), compiled, board })
  console.log('')
  for (const line of verdict.problems) console.log('✗ ' + line)
  // Once the work is ready, the agent reviews its session and asks whether to share it with the owner (docs/AGENT_SESSIONS.md), unless the developer said never.
  if (verdict.ok) { const sharing = await import('./agent-session.mjs'), preference = await sharing.readPreference(); verdict.notes.push(sharing.reviewLine); if (preference !== 'never') verdict.notes.push(sharing.sharingLine(preference)) }
  for (const line of verdict.notes) console.log('· ' + line)
  console.log(!verdict.ok ? 'Not ready yet.' : draftOnly ? 'Ready as a draft: missing release evidence is listed above as a warning. Run pr:ready without --draft before you mark it ready for review.' : verdict.baseDraft ? 'Ready to update the cumulative base draft.' : verdict.instrument
    ? 'Ready: local checks passed. Once unit results for the exact build are recorded, mark the draft ready on GitHub and verify its status.'
    : 'Ready: local checks passed. Push the checked commit, mark any draft ready on GitHub, and verify its status.')
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
