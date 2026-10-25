import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { authorReleaseEvent, authorRequestedRelease } from '../src/release/author-updates.ts'
import { inspectAuthorUpdate } from './author-update-git.mjs'
import { githubApi, pages, mergeAuthorPull } from './author-release-api.mjs'

const repository = process.env.GITHUB_REPOSITORY, api = githubApi(repository, process.env.GITHUB_TOKEN)
const event = authorReleaseEvent(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')))
const root = fileURLToPath(new URL('../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const pulls = await pages(api, '/pulls?state=open')
for (const candidate of pulls.filter(pr => pr.head?.sha === event.head && pr.base?.ref === 'main' && (!event.number || pr.number === event.number))) {
  const pr = await api('/pulls/' + candidate.number)
  if (pr.draft || !authorRequestedRelease(pr.body) || pr.base.repo.full_name !== repository) continue
  const base = (await api('/git/ref/heads/main')).object.sha, head = pr.head.sha
  if (git('rev-parse', 'HEAD') !== base) throw new Error('Main changed before author authorization; rebase and rerun checks.')
  // Fetch objects into a private ref without checkout, credentials, npm or module execution.
  git('fetch', '--no-tags', 'https://github.com/' + repository + '.git', 'refs/pull/' + pr.number + '/head')
  if (git('rev-parse', 'FETCH_HEAD') !== head) throw new Error('Author updated the PR while it was being inspected.')
  let scope
  try { scope = inspectAuthorUpdate(root, base, head, pr.user) }
  catch (error) {
    console.log('PR #' + pr.number + ' needs owner review: ' + error.message)
    // Say why once on the PR, so the author is not left waiting for an automatic release that will not come.
    const body = '<!-- modwerk-owner-review -->\nThis update needs owner review instead of automatic publication: ' + error.message
    await comment(pr.number, body, comments => comments.some(item => item.body === body))
    continue
  }
  // Expected head SHA and GitHub branch protection are enforced by the merge endpoint.
  const runId = await mergeAuthorPull(api, repository, pr.number, head, base, scope, event.runId)
  console.log('Author PR #' + pr.number + ' merged after CI run ' + runId + '; site and API publication requested for ' + scope.modules.join(', ') + '.')
  // The mention notifies the owner of every release made without owner review, while the follower hold runs.
  await comment(pr.number, '@' + repository.split('/')[0] + ' ' + scope.modules.join(', ') + ' was published by @' + pr.user.login + ' without owner review: https://github.com/' + repository + '/compare/' + base + '...' + head +
    '\n\nFollowers hear about it 48 hours after it goes live. To stop that, publish a corrected version before then. To stop further automatic releases by this author, remove them from `.github/module-authors.json`.')
}

async function comment(number, body, posted = () => false) {
  // A notice never undoes a merge or blocks the next candidate.
  try { if (!posted(await pages(api, '/issues/' + number + '/comments'))) await api('/issues/' + number + '/comments', 'POST', { body }) }
  catch (error) { console.log('::warning::Could not comment on PR #' + number + ': ' + error.message) }
}
