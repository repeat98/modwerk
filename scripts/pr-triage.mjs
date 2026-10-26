// Keeps red and queued pull requests out of the owner's review list. Reads GitHub metadata only:
// no PR checkout, dependency or code runs here.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { githubApi, pages } from './author-release-api.mjs'

export const NEEDS_WORK = 'needs-work', ONE_AT_A_TIME = 'one-at-a-time', CLOSE_AFTER_DAYS = 14
const MARKER = '<!-- modwerk-triage -->'
export const MESSAGES = {
  [NEEDS_WORK]: MARKER + '\nA required check failed, so this pull request is out of the review queue for now. Run `npm run pr:ready` (a registered author: `npm run pr:ready -- --author <login>`) until it says Ready, then push: the label goes away by itself once the checks are green. If nothing changes for ' + CLOSE_AFTER_DAYS + ' days it is closed, and you can reopen it whenever it is green. See [Make it mergeable](https://github.com/repeat98/modwerk/blob/main/docs/DEVELOPER_WORKFLOW.md#make-it-mergeable).',
  [ONE_AT_A_TIME]: MARKER + '\nThanks for this. Until your first module is published, one module pull request is reviewed at a time, so this one waits until your earlier one is merged or closed. Nothing to do: the label goes away by itself.',
  close: MARKER + '\nClosing this because its checks have been red for ' + CLOSE_AFTER_DAYS + ' days without a new commit. Nothing is lost: push a fix and reopen it whenever `npm run pr:ready` says Ready.',
}

/** What to do with one open, non-draft PR. Pure, so the policy is tested without GitHub. */
export function decide({ red, labels, labeledAt, headDate, now, queued }) {
  const has = new Set(labels), actions = []
  if (red && !has.has(NEEDS_WORK)) actions.push({ add: NEEDS_WORK })
  if (!red && has.has(NEEDS_WORK)) actions.push({ remove: NEEDS_WORK })
  if (queued && !has.has(ONE_AT_A_TIME)) actions.push({ add: ONE_AT_A_TIME })
  if (!queued && has.has(ONE_AT_A_TIME)) actions.push({ remove: ONE_AT_A_TIME })
  const stale = (now - Date.parse(labeledAt ?? '')) / 86400000 >= CLOSE_AFTER_DAYS && Date.parse(headDate) <= Date.parse(labeledAt)
  if (red && has.has(NEEDS_WORK) && stale) actions.push({ close: true })
  return actions
}

/** Contributors without a published module get one module PR reviewed at a time: every newer one waits. */
export function queuedPulls(pulls, registered) {
  const waiting = new Set(), byAuthor = new Map()
  for (const pr of [...pulls].sort((a, b) => a.number - b.number)) {
    if (!pr.module || registered.has(pr.author)) continue
    if (byAuthor.has(pr.author)) waiting.add(pr.number); else byAuthor.set(pr.author, pr.number)
  }
  return waiting
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY, api = githubApi(repository, process.env.GITHUB_TOKEN), owner = repository.split('/')[0].toLowerCase()
  // PR_TRIAGE_DRY_RUN=1 reads the live repository and prints the writes instead of making them.
  const write = process.env.PR_TRIAGE_DRY_RUN === '1' ? async (path, method) => console.log('dry run: ' + method + ' ' + path) : api
  // Anyone with a published module (author or maintainer) or release authority skips the queue.
  const json = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
  const documents = [...json('src/catalog/module-documents.json').modules, ...['digitakt', 'digitone', 'analog-rytm-mkii'].flatMap(machine => {
    const folder = 'sdk/' + machine + '/modules/'
    return readdirSync(new URL('../' + folder, import.meta.url)).filter(id => existsSync(new URL('../' + folder + id + '/modwerk.module.json', import.meta.url))).map(id => json(folder + id + '/modwerk.module.json'))
  })]
  const registered = new Set([...Object.keys(json('.github/module-authors.json').accounts), ...documents.flatMap(doc => [doc.author?.github, ...(doc.maintainers ?? [])])].filter(Boolean).map(login => login.toLowerCase()))
  for (const [name, color] of [[NEEDS_WORK, 'b60205'], [ONE_AT_A_TIME, 'fbca04']]) {
    try { await write('/labels', 'POST', { name, color, description: name === NEEDS_WORK ? 'A required check failed; out of the review queue until green' : 'Waits for the contributor’s earlier module PR' }) }
    catch (error) { if (!/HTTP 422/.test(error.message)) throw error }
  }
  const open = (await pages(api, '/pulls?state=open')).filter(pr => !pr.draft && pr.user.type === 'User' && pr.user.login.toLowerCase() !== owner)
  const pulls = []
  for (const pr of open) {
    const files = await pages(api, '/pulls/' + pr.number + '/files')
    pulls.push({ pr, number: pr.number, author: pr.user.login.toLowerCase(), module: files.some(file => /^sdk\/[^/]+\/modules\//.test(file.filename)) })
  }
  const queued = queuedPulls(pulls, registered), now = Date.now()
  for (const { pr } of pulls) {
    const runs = await pages(api, '/commits/' + pr.head.sha + '/check-runs?filter=latest', 'check_runs')
    const red = runs.some(run => ['failure', 'timed_out', 'startup_failure'].includes(run.conclusion))
    const labeled = (await pages(api, '/issues/' + pr.number + '/events')).filter(event => event.event === 'labeled' && event.label?.name === NEEDS_WORK).at(-1)
    const actions = decide({ red, labels: pr.labels.map(label => label.name), labeledAt: labeled?.created_at, headDate: (await api('/commits/' + pr.head.sha)).commit.committer.date, now, queued: queued.has(pr.number) })
    for (const action of actions) {
      if (action.add) { await write('/issues/' + pr.number + '/labels', 'POST', { labels: [action.add] }); await write('/issues/' + pr.number + '/comments', 'POST', { body: MESSAGES[action.add] }) }
      if (action.remove) await write('/issues/' + pr.number + '/labels/' + action.remove, 'DELETE')
      if (action.close) { await write('/issues/' + pr.number + '/comments', 'POST', { body: MESSAGES.close }); await write('/pulls/' + pr.number, 'PATCH', { state: 'closed' }) }
      console.log('#' + pr.number + ' ' + JSON.stringify(action))
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
