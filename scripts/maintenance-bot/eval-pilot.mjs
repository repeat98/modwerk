// SPDX-License-Identifier: Elastic-2.0
import { cases } from '../agent-eval/cases.mjs'
import { pages } from '../author-release-api.mjs'

// Main when the owner requested the five-fix pilot (PR #1915).
const baseline = '2026-11-21T09:13:37Z'
export const fixLimit = 5
export const dispositions = ['other', 'covered', 'unsuitable', 'gap']
const productionScript = path => /(?:^|\/)scripts\/.*\.(?:[cm]?js|[cm]?ts)$/.test(path)
  && !/(?:^|\/)(?:tests?|__tests__|fixtures)(?:\/|$)|\.(?:test|spec)\.[^.]+$|\.d\.ts$/.test(path)

export async function pilotCandidates(api, records) {
  const seen = new Set(records.map(row => row.number))
  if (records.filter(row => row.verdict !== 'other').length >= fixLimit) return []
  const merged = []
  for (let page = 1; ; page++) {
    const rows = await api('/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=' + page)
    merged.push(...rows.filter(pr => pr.merged_at > baseline && !seen.has(pr.number)))
    if (rows.length < 100 || rows.at(-1).updated_at < baseline) break
  }
  merged.sort((a, b) => a.merged_at.localeCompare(b.merged_at) || a.number - b.number)
  const candidates = []
  for (const pr of merged) {
    const files = await pages(api, '/pulls/' + pr.number + '/files')
    const scripts = files.filter(f => [f.filename, f.previous_filename].some(name => name && productionScript(name)))
    if (!scripts.length) continue
    // The shared maintenance prompt also sees private conversations. It can select only public evidence
    // by index. No model-written text crosses into a public wanted task.
    const hints = [pr.title]
    for (const file of files) {
      const patch = file.patch ?? ''
      if (/^changelog\/[^/]+\.md$/.test(file.filename)) {
        for (const line of patch.split('\n')) if (/^\+[^+#]/.test(line)) hints.push(line.slice(1).replace(/^[-*] /, '').trim())
      } else if (/\.(?:test|spec)\.[^.]+$/.test(file.filename)) {
        for (const match of patch.matchAll(/^\+\s*(?:it|test)\(\s*['"]([^'"\n]{8,160})['"]/gm)) hints.push(match[1])
      }
    }
    candidates.push({ number: pr.number, merge: pr.merge_commit_sha, authorId: pr.user.id, author: pr.user.login,
      scripts: scripts.map(file => file.filename), hints: [...new Set(hints)].filter(Boolean).slice(0, 24) })
    if (candidates.length === fixLimit) break
  }
  return candidates
}

export async function recordPilotReviews(api, bot, reviews) {
  const { records } = await bot('/eval-pilot')
  let remaining = fixLimit - records.filter(row => row.verdict !== 'other').length
  for (const candidate of await pilotCandidates(api, records)) {
    const review = reviews.find(row => row?.number === candidate.number && row.merge === candidate.merge)
    if (!remaining || !review) break // A missing earlier review must never be overtaken.
    if (!dispositions.includes(review.verdict)) throw new Error('Invalid eval pilot verdict for #' + candidate.number)
    const hint = candidate.hints[review.hint]
    if (review.verdict === 'gap' && (!Number.isInteger(review.hint) || !hint)) throw new Error('Choose public evidence for #' + candidate.number)
    await bot('/eval-pilot', 'POST', { number: candidate.number, merge: candidate.merge, authorId: candidate.authorId,
      verdict: review.verdict, hint: review.verdict === 'gap' ? hint : undefined })
    if (review.verdict !== 'other') remaining--
  }
}

// The board records a claim. GitHub and the corpus on trusted main establish what actually landed.
export async function settlePilot(api, bot, readThread, records, corpus = cases) {
  for (const row of records.filter(row => row.task && !row.result)) {
    const thread = (await readThread('/messages/' + row.task))?.message
    if (!thread?.to) continue
    const observed = thread.replies.find(reply => reply.author === thread.to && reply.outcome === 'different-result')
    if (observed) {
      await bot('/eval-pilot/' + row.number, 'POST', { result: 'different-result' })
      continue
    }
    if (!thread.pullRequest || thread.pullRequest === row.number) continue
    // A board link can be an issue number or a typo. Keep the task open so the holder can correct it.
    const pr = await api('/pulls/' + thread.pullRequest).catch(error => {
      if (error.message.endsWith(' HTTP 404')) return null
      throw error
    })
    if (!pr?.merged || pr.base.ref !== 'main' || pr.user.id === row.authorId ||
        pr.user.login.toLowerCase() !== thread.to.toLowerCase()) continue
    const item = corpus.find(item => item.pr === row.number && item.merge === row.merge)
    if (!item) continue
    const files = await pages(api, '/pulls/' + pr.number + '/files')
    if (!files.find(file => file.filename === 'scripts/agent-eval/cases.mjs')?.patch?.split('\n')
      .some(line => line.startsWith('+') && (line.includes("'" + item.id + "'") || line.includes('"' + item.id + '"')))) continue
    const runs = await api('/actions/workflows/agent-eval.yml/runs?event=pull_request&head_sha=' + pr.head.sha + '&per_page=100')
    if (!runs.workflow_runs.some(run => run.conclusion === 'success' && run.head_sha === pr.head.sha &&
      (run.pull_requests?.some(pull => pull.number === pr.number) ||
        (run.head_repository?.id && run.head_repository.id === pr.head.repo?.id && run.head_branch === pr.head.ref)))) continue
    await bot('/eval-pilot/' + row.number, 'POST', { result: 'added', evidence: pr.number })
  }
}

export function pilotReport(records) {
  const fixes = records.filter(row => row.verdict !== 'other')
  const pending = fixes.filter(row => row.task && !row.result).length
  const added = fixes.filter(row => row.result === 'added')
  const counts = fixes.length + '/5 fixes screened, ' + added.length + ' verified case' + (added.length === 1 ? '' : 's') + ' added to the eval suite'
  const sources = added.map(row => '#' + row.evidence).join(', ')
  return 'Node eval pilot' + (fixes.length === fixLimit && !pending ? ' complete' : '') + ': ' + counts
    + (sources ? ' (' + sources + ')' : '') + (pending ? ', ' + pending + ' awaiting independent verification or merge' : '') + '.'
}
