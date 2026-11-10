import { authorRequestedRelease, requireAuthorChecks } from '../src/release/author-updates.ts'

export function githubApi(repository, token) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid release repository.')
  return async (path, method = 'GET', body) => {
    const response = await fetch('https://api.github.com/repos/' + repository + path, {
      method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error('GitHub author release request failed: ' + method + ' ' + path + ' HTTP ' + response.status)
    const text = await response.text()
    if (text.length > 8 * 1024 * 1024) throw new Error('GitHub author release response is too large.')
    return text ? JSON.parse(text) : null
  }
}
export async function pages(api, path, field) {
  const rows = []
  for (let page = 1; page <= 30; page++) {
    const value = await api(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page)
    const batch = field ? value[field] : value
    if (!Array.isArray(batch)) throw new Error('Invalid paginated GitHub author release response.')
    rows.push(...batch)
    if (batch.length < 100) return rows
  }
  throw new Error('Author release exceeds the bounded GitHub query limit.')
}
export async function authorChecks(api, repository, head, base, scope, expectedRunId) {
  const workflow = await api('/actions/workflows/module-pr.yml')
  const list = await api('/actions/workflows/' + workflow.id + '/runs?event=pull_request&head_sha=' + head + '&per_page=1')
  const run = list.workflow_runs?.[0]
  if (!run || expectedRunId && run.id !== expectedRunId) throw new Error('A newer CI run replaced this author update check.')
  const jobs = await pages(api, '/actions/runs/' + run.id + '/jobs?filter=latest', 'jobs')
  requireAuthorChecks(run, jobs, repository, head, base, workflow.id, scope)
  return run.id
}
export async function publishAuthorMerge(api) {
  // GITHUB_TOKEN merges do not emit push workflows; workflow_dispatch does.
  for (const workflow of ['pages.yml', 'worker.yml']) await api('/actions/workflows/' + workflow + '/dispatches', 'POST', { ref: 'main' })
}
export async function mergeAuthorPull(api, repository, number, head, base, scope, expectedRunId) {
  const runId = await authorChecks(api, repository, head, base, scope, expectedRunId)
  const pr = await api('/pulls/' + number)
  if (pr.state !== 'open' || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== repository || pr.draft || !authorRequestedRelease(pr.body) || pr.head.sha !== head || (await api('/git/ref/heads/main')).object.sha !== base) throw new Error('Author release changed after validation.')
  const result = await api('/pulls/' + number + '/merge', 'PUT', { sha: head, merge_method: 'merge' })
  if (!result.merged) throw new Error('GitHub refused this author release; the existing release remains available.')
  const commit = await api('/git/commits/' + result.sha)
  if (commit.parents?.length !== 2 || commit.parents[0].sha !== base || commit.parents[1].sha !== head) {
    // The merge stays on main, so tell the owner now: the caller's notice runs only after a clean merge.
    await api('/issues/' + number + '/comments', 'POST', { body: '@' + repository.split('/')[0] + ' ' + scope.modules.join(', ') + ' was merged without owner review, but main moved during the merge, so publication stopped. The merge stays on main; review it before the next release: https://github.com/' + repository + '/compare/' + base + '...' + head })
      .catch(error => console.log('::warning::Could not comment on PR #' + number + ': ' + error.message))
    throw new Error('Main moved during merge; publication requires fresh checks and owner review.')
  }
  await publishAuthorMerge(api)
  return runId
}
