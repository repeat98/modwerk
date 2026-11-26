import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOwnerApproval, releaseIdentity } from '../src/release/approval.ts'
import { ACTIONS_BOT_ID, authorRequestedRelease } from '../src/release/author-updates.ts'
import { inspectAuthorUpdate } from './author-update-git.mjs'
import { githubApi, pages, authorChecks } from './author-release-api.mjs'

// A maintainer the owner listed may merge into main and publish (owner, 26 November 2026). The list and the gate stay
// the owner's: a maintainer's merge that changes them is not approved, so no one can list themselves.
export const MAINTAINERS_FILE = 'sdk/approvals/release-maintainers.json'
const GATE_PATHS = /^(?:sdk\/approvals\/|scripts\/(?:release-approval|verify-merge-approval|author-release-api|author-update-git)\.mjs$|src\/release\/|\.github\/workflows\/pages\.yml$)/

/** The owner's listed maintainers, from the release's own checkout: id -> login. */
export function readMaintainers(root) {
  let value
  try { value = JSON.parse(readFileSync(join(root, MAINTAINERS_FILE), 'utf8')) } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error }
  if (value?.schemaVersion !== 1 || !Array.isArray(value.maintainers)) throw new Error('Invalid ' + MAINTAINERS_FILE)
  const result = new Map()
  for (const entry of value.maintainers) {
    if (!Number.isSafeInteger(entry?.id) || entry.id < 1 || typeof entry.login !== 'string' || entry.approvedBy !== 'repeat98' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.approvedOn ?? '') || typeof entry.ownerStatement !== 'string' || !entry.ownerStatement.trim()) throw new Error('Invalid maintainer in ' + MAINTAINERS_FILE)
    result.set(entry.id, entry.login)
  }
  return result
}

/** A pull request a listed maintainer merged into main as exactly this commit, or null. `changed` is what the commit
 * changes on main; one that touches the list or the gate needs the owner's merge. */
export function maintainerApproval({ repository, commit, pr, merges, changed, maintainers, ownerId }) {
  const merger = pr?.merged_by
  if (pr?.merged !== true || pr.state !== 'closed' || pr.base?.ref !== 'main' || pr.base.repo?.full_name !== repository) return null
  if (!merger || maintainers.get(merger.id) !== merger.login) return null
  if (merges.length !== 1 || merges[0].commit_id !== commit || merges[0].actor?.id !== merger.id || pr.merge_commit_sha && pr.merge_commit_sha !== commit) return null
  if (changed.some(path => GATE_PATHS.test(path))) return null
  return { kind: 'github-pr-merge', repository, sourceCommit: commit, baseRef: 'main', pullRequest: pr.number, mergedBy: merger.login,
    mergedById: merger.id, moduleApproverId: ownerId, mergedAt: pr.merged_at, authorization: 'maintainer' }
}

/** Re-fetch GitHub evidence independently of compiler output and the merge job. */
export async function fetchReleaseApproval(repository, commit, ownerId, token = '', attempts = 7, retryMs = 15000, options = {}) {
  releaseIdentity(repository, commit, ownerId)
  const api = githubApi(repository, token), root = options.root ?? fileURLToPath(new URL('../', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const approval = await fetchOwnerApproval(repository, commit, ownerId, token, 1, 0)
      // The Worker merges in the owner's name. A base advance during GitHub's merge must stop publication.
      const message = git('show', '-s', '--format=%b', commit)
      if (message.startsWith('Modwerk reviewed merge\n')) {
        const parents = git('show', '-s', '--format=%P', commit).split(' ')
        const receipt = /^Modwerk reviewed merge\nBase: ([0-9a-f]{40})\nHead: ([0-9a-f]{40})\nReview: (\d+)\nApproved by: ([a-z\d-]+) \((\d+), (maintainer|device-reviewer)\)$/i.exec(message)
        if (!receipt || parents.length !== 2 || parents[0] !== receipt[1] || parents[1] !== receipt[2]) throw new Error('Reviewed merge parents differ from the authorized base and head.')
        return { ...approval, authorization: receipt[6], reviewId: Number(receipt[3]), reviewerId: Number(receipt[5]), checkedBase: parents[0], checkedHead: parents[1] }
      }
      return approval
    }
    catch (error) { if (!error.message.startsWith('No owner-merged PR')) throw error }
    const pulls = await pages(api, '/commits/' + commit + '/pulls'), maintainers = readMaintainers(root)
    for (const item of pulls) {
      const pr = await api('/pulls/' + item.number)
      if (maintainers.has(pr.merged_by?.id)) {
        const merges = (await pages(api, '/issues/' + pr.number + '/events')).filter(event => event.event === 'merged')
        const changed = git('diff', '--name-only', commit + '^1', commit).split('\n').filter(Boolean)
        const approval = maintainerApproval({ repository, commit, pr, merges, changed, maintainers, ownerId })
        if (approval) return approval
      }
      if (pr.merged !== true || pr.state !== 'closed' || pr.base?.ref !== 'main' || pr.base.repo.full_name !== repository || pr.merged_by?.id !== ACTIONS_BOT_ID || pr.merged_by.login !== 'github-actions[bot]' || !authorRequestedRelease(pr.body)) continue
      const events = await pages(api, '/issues/' + pr.number + '/events'), merges = events.filter(event => event.event === 'merged')
      if (merges.length !== 1 || merges[0].commit_id !== commit || merges[0].actor?.id !== ACTIONS_BOT_ID || pr.merge_commit_sha && pr.merge_commit_sha !== commit) continue
      const parents = git('rev-list', '--parents', '-n', '1', commit).split(' ')
      if (parents.length !== 3 || parents[2] !== pr.head.sha) continue
      const scope = inspectAuthorUpdate(root, parents[1], parents[2], pr.user)
      const runId = await authorChecks(api, repository, parents[2], parents[1], scope)
      return { kind: 'github-pr-merge', repository, sourceCommit: commit, baseRef: 'main', pullRequest: pr.number,
        mergedBy: pr.merged_by.login, mergedById: ACTIONS_BOT_ID, moduleApproverId: ownerId, mergedAt: pr.merged_at,
        authorization: 'module-author', authorId: pr.user.id, modules: scope.modules, checkedHead: parents[2], checkedBase: parents[1], checkRunId: runId }
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryMs))
  }
  throw new Error('No owner, listed maintainer or authorized module-author PR approves this exact main commit; keep the previous publication.')
}

/** A release publishes every main commit since the last one, so each needs its own approval, unless a later commit in
 * the range reverts it. Checking only the newest let a self-merged first release out with the owner's next merge
 * (#1937, 21 November 2026). Throws naming each unapproved commit; the newest is left to the caller's own check. */
export async function verifyUnreleased({ repository, last, head, ownerId, token = '', root, check = fetchReleaseApproval }) {
  if (!last) return []
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('merge-base', '--is-ancestor', last, head)
  const reverted = new Set([...git('log', '--format=%B', last + '..' + head).matchAll(/This reverts commit ([0-9a-f]{40})/g)].map(match => match[1]))
  const earlier = git('rev-list', '--first-parent', last + '..' + head).split('\n').filter(commit => commit && commit !== head && !reverted.has(commit))
  const refused = []
  for (const commit of earlier) {
    try { await check(repository, commit, ownerId, token, undefined, undefined, { root }) }
    catch (error) { refused.push(commit.slice(0, 9) + ' "' + git('show', '-s', '--format=%s', commit) + '": ' + error.message) }
  }
  if (refused.length) throw new Error('This release would also publish main commits nobody approved:\n' + refused.join('\n') +
    '\nRevert each in a pull request the owner merges (git revert -m 1 <commit>, or plain git revert for a squash), or land it again through review; nothing publishes until then.')
  return earlier
}
