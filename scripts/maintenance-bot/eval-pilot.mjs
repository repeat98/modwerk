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
    // The classifier selects public evidence by index. No model-written text crosses into a GitHub issue.
    const hints = [pr.title]
    for (const file of files) {
      const patch = file.patch ?? ''
      if (/^changelog\/[^/]+\.md$/.test(file.filename)) {
        for (const line of patch.split('\n')) if (/^\+[^+#]/.test(line)) hints.push(line.slice(1).replace(/^[-*] /, '').trim())
      } else if (/\.(?:test|spec)\.[^.]+$/.test(file.filename)) {
        for (const match of patch.matchAll(/^\+\s*(?:it|test)\(\s*['"]([^'"\n]{8,160})['"]/gm)) hints.push(match[1])
      }
    }
    // GitHub REST 2026-03-10 omits merge_commit_sha from both PR representations.
    const merge = pr.merge_commit_sha ?? (await pages(api, '/issues/' + pr.number + '/timeline'))
      .findLast(event => event.event === 'merged')?.commit_id
    if (typeof merge !== 'string' || !/^[a-f0-9]{40}$/.test(merge)) throw Error('Missing merge commit for pilot candidate #' + pr.number)
    candidates.push({ number: pr.number, merge, authorId: pr.user.id, author: pr.user.login,
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

const names = (issue, number) => new RegExp('#' + number + '(?!\\d)').test(issue.title + '\n' + (issue.body ?? ''))

/** Main's agent eval controls passed at this commit (the replay job may still fail on the model). */
async function controlsPass(api, sha) {
  const { workflow_runs: runs } = await api('/actions/workflows/agent-eval.yml/runs?event=push&branch=main&head_sha=' + sha + '&per_page=10')
  for (const run of runs) if ((await api('/actions/runs/' + run.id + '/jobs')).jobs.some(job => job.name === 'controls' && job.conclusion === 'success')) return true
  return false
}

/**
 * Each open gap is a GitHub issue labelled workflow and help wanted, opened once unless an issue already names the
 * source PR. It counts once main's suite holds a case for that exact merge and main's controls pass at `sha`, the
 * commit this job checked out. An issue closed as not planned records a different result.
 */
export async function settlePilot(api, bot, records, sha, corpus = cases) {
  const gaps = records.filter(row => row.verdict === 'gap' && !row.result)
  if (!gaps.length) return
  const issues = (await pages(api, '/issues?state=all&labels=workflow')).filter(issue => !issue.pull_request)
  let passed
  for (const row of gaps) {
    const issue = issues.find(item => names(item, row.number))
    if (corpus.some(item => item.pr === row.number && item.merge === row.merge) && (passed ??= await controlsPass(api, sha))) {
      await bot('/eval-pilot/' + row.number, 'POST', { result: 'added', evidence: issue?.number ?? row.number })
    } else if (issue?.state === 'closed' && issue.state_reason === 'not_planned') {
      await bot('/eval-pilot/' + row.number, 'POST', { result: 'different-result' })
    } else if (!issue) {
      issues.push(await api('/issues', 'POST', { labels: ['workflow', 'help wanted'], title: 'Eval case for the Node fix in #' + row.number,
        body: 'The five-fix eval pilot found no replay case for the Node script fix in #' + row.number + '. ' + (row.hint ? row.hint.replace(/[.\s]+$/, '') + '. ' : '')
          + '\n\nAdd a public offline case for it, as the five-fix pilot in docs/AGENT_EVALS.md describes: the parent fails, the merge passes and a working control stays green. Someone other than the fix\'s author writes it.' }))
    }
  }
}

export function pilotReport(records) {
  const fixes = records.filter(row => row.verdict !== 'other')
  const pending = fixes.filter(row => row.verdict === 'gap' && !row.result).length
  const added = fixes.filter(row => row.result === 'added')
  const counts = fixes.length + '/5 fixes screened, ' + added.length + ' verified case' + (added.length === 1 ? '' : 's') + ' added to the eval suite'
  const sources = added.map(row => '#' + row.evidence).join(', ')
  return 'Node eval pilot' + (fixes.length === fixLimit && !pending ? ' complete' : '') + ': ' + counts
    + (sources ? ' (' + sources + ')' : '') + (pending ? ', ' + pending + ' awaiting a case on main' : '') + '.'
}
