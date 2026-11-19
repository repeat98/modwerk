// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// An explicit command in a new PR comment, backed by the sender's current approving GitHub review.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { authorChecks, githubApi, pages } from '../author-release-api.mjs'
import { readChangeScope } from '../change-scope.mjs'
import { inspectFirstRelease } from './first-release.mjs'
import { approveRun, ledger } from './lib.mjs'

export function mergeCommand(event) {
  const actor = event.comment?.user, head = /^\/modwerk merge ([0-9a-f]{40})$/.exec(event.comment?.body?.trim() ?? '')?.[1]
  if (event.action !== 'created' || !event.issue?.pull_request || !head || actor?.type !== 'User' ||
    !Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.id !== event.sender?.id || actor.login !== event.sender.login ||
    !Number.isSafeInteger(event.issue.number) || event.issue.number < 1) throw new Error('Expected a new merge command for an exact PR commit')
  return { actor, head, number: event.issue.number }
}

export function currentApproval(reviews, actorId, head) {
  const latest = reviews.filter(review => review.user?.id === actorId && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)).at(-1)
  if (!latest || latest.state !== 'APPROVED' || latest.commit_id !== head) throw new Error('Approve the current PR commit before requesting its merge')
  return latest.id
}

export async function mergeReviewed({ event, repository, api, bot, root = process.cwd() }) {
  const { number, head, actor } = mergeCommand(event)
  const pull = () => api('/pulls/' + number)
  function checkPull(pr, base) {
    if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' || pr.base.repo.full_name !== repository ||
      pr.base.sha !== base || pr.head.sha !== head || pr.user.id === actor.id) throw new Error('Expected an open, independently reviewed PR at the checked base and head')
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
  const pr = await pull(), base = git('rev-parse', 'HEAD')
  checkPull(pr, base)
  const reviews = () => pages(api, '/pulls/' + number + '/reviews')
  currentApproval(await reviews(), actor.id, head)
  git('fetch', '--no-tags', 'origin', 'refs/pull/' + number + '/head')
  if (git('rev-parse', 'FETCH_HEAD') !== head) throw new Error('The reviewed head changed')
  git('merge-base', '--is-ancestor', base, head)

  // Permission is GitHub's current effective repository permission. Read and triage remain device-scoped.
  const permissions = await api('/collaborators/' + encodeURIComponent(actor.login) + '/permission').catch(error => {
    if (error.message.endsWith(' HTTP 404')) return {}
    throw error
  })
  const maintainer = permissions.user?.id === actor.id && ['admin', 'maintain', 'write'].includes(permissions.permission)
  if (maintainer && actor.id !== event.repository?.owner?.id && git('diff', '--name-only', base, head, '--', 'sdk/approvals/')) {
    throw new Error('Owner-signed build approvals require the repository owner')
  }
  const scope = maintainer ? {} : inspectFirstRelease(root, base, head, pr.user, actor)
  const waiting = await api('/actions/workflows/module-pr.yml/runs?event=pull_request&status=action_required&head_sha=' + head + '&per_page=1')
  const run = waiting.workflow_runs[0]
  if (run) {
    if (!Number.isSafeInteger(run.id) || run.id < 1 || run.event !== 'pull_request' || run.head_sha !== head ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== pr.head.repo?.full_name ||
      !run.head_repository?.full_name || run.head_branch !== pr.head.ref || run.path !== '.github/workflows/module-pr.yml' ||
      run.pull_requests?.length && !run.pull_requests.some(p => p.number === number)) throw new Error('Waiting CI run does not match the reviewed submission')
    if ((await bot('/state')).paused) throw new Error('Maintenance is paused')
    currentApproval(await reviews(), actor.id, head)
    checkPull(await pull(), base)
    await approveRun(api, run.id)
    console.log('Started Module PR checks for PR #' + number + '. After they pass, post the merge command again for ' + head + '.')
    return
  }
  const changes = readChangeScope({ root, base, head })
  const checkRun = await authorChecks(api, repository, head, base, { octatrack: changes.modules, elemodCompile: changes.elemod, requireAggregate: true })
  const review = currentApproval(await reviews(), actor.id, head)
  checkPull(await pull(), base)
  if ((await api('/git/ref/heads/main')).object.sha !== base) throw new Error('Main changed during review')
  const result = await bot('/merge/reviewed', 'POST', { number, sha: head, method: 'merge', review: {
    base, id: review, actorId: actor.id, login: actor.login, role: maintainer ? 'maintainer' : 'device-reviewer', ...scope, checkRun,
  } })
  console.log('Merged PR #' + number + ' at ' + result.sha + ' on approval by @' + actor.login)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY
  await mergeReviewed({ event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), repository,
    api: githubApi(repository, process.env.GITHUB_TOKEN), bot: ledger() })
}
