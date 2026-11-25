import { describe, expect, it } from 'vitest'
import { mergeAuthorPull } from './author-release-api.mjs'
import { AUTHOR_RELEASE_REQUEST, AUTHOR_RELEASE_EVIDENCE } from '../src/release/author-updates.ts'
const repository = 'repeat98/modwerk', base = 'b'.repeat(40), head = 'a'.repeat(40), merged = 'c'.repeat(40)
function fixture(options = {}) {
  const calls = [], body = '- [x] ' + AUTHOR_RELEASE_REQUEST + '\n- [x] ' + AUTHOR_RELEASE_EVIDENCE
  const api = async (path, method = 'GET', data) => {
    calls.push({ path, method, data })
    if (path === '/actions/workflows/module-pr.yml') return { id: 12 }
    if (path.startsWith('/actions/workflows/12/runs')) return { workflow_runs: [{ id: options.runId ?? 77, workflow_id: 12, path: '.github/workflows/module-pr.yml', event: 'pull_request', repository: { full_name: repository }, head_sha: head, status: 'completed', conclusion: options.conclusion ?? 'success' }] }
    if (path.startsWith('/actions/runs/')) return { jobs: ['scope / ' + base + ' / ' + head, 'module-contract', 'octatrack-source'].map(name => ({ name, status: 'completed', conclusion: 'success' })) }
    if (path === '/pulls/9') return { state: 'open', base: { ref: options.ref ?? 'main', repo: { full_name: repository } }, draft: options.draft ?? false, head: { sha: options.head ?? head }, body: options.withdraw ? '' : body }
    if (path === '/git/ref/heads/main') return { object: { sha: options.base ?? base } }
    if (path === '/pulls/9/merge') return { merged: options.refused ? false : true, sha: merged }
    if (path === '/git/commits/' + merged) return { parents: [{ sha: options.mergedBase ?? base }, { sha: head }] }
    if (path.endsWith('/dispatches')) return null
    if (path === '/issues/9/comments') { if (options.commentFails) throw new Error('HTTP 502'); return {} }
    throw new Error('Unexpected API path ' + path)
  }
  return { api, calls, execute: expectedRunId => mergeAuthorPull(api, repository, 9, head, base, { octatrack: true, packages: false, elemodCompile: false, modules: ['tapehead'] }, expectedRunId) }
}
describe('author merge and publication transaction', () => {
  it('merges the expected head and dispatches both deployments after verifying merge parents', async () => {
    const f = fixture()
    expect(await f.execute(77)).toBe(77)
    expect(f.calls.filter(call => call.method === 'PUT')).toEqual([{ path: '/pulls/9/merge', method: 'PUT', data: { sha: head, merge_method: 'merge' } }])
    expect(f.calls.filter(call => call.method === 'POST')).toEqual(['pages.yml', 'worker.yml'].map(name => ({ path: '/actions/workflows/' + name + '/dispatches', method: 'POST', data: { ref: 'main' } })))
  })
  it('checks the latest successful source CI when the author opts in after CI finishes', async () => {
    const f = fixture({ runId: 78 })
    expect(await f.execute()).toBe(78)
    expect(f.calls.some(call => call.method === 'PUT')).toBe(true)
  })
  it.each([{ runId: 78 }, { conclusion: 'failure' }, { draft: true }, { head: merged }, { base: merged }, { withdraw: true }, { ref: 'other' }])('never mutates GitHub when validation changes: %j', async options => {
    const f = fixture(options)
    await expect(f.execute(77)).rejects.toThrow()
    expect(f.calls.every(call => call.method === 'GET')).toBe(true)
  })
  it('does not publish a refused merge', async () => {
    const f = fixture({ refused: true })
    await expect(f.execute(77)).rejects.toThrow()
    expect(f.calls.some(call => call.method === 'POST')).toBe(false)
  })
  it.each([{}, { commentFails: true }])('tells the owner on the PR, without publishing, when main moved during the merge: %j', async options => {
    const f = fixture({ mergedBase: head, ...options })
    await expect(f.execute(77)).rejects.toThrow('Main moved during merge')
    const posts = f.calls.filter(call => call.method === 'POST')
    expect(posts.map(call => call.path)).toEqual(['/issues/9/comments'])
    expect(posts[0].data.body).toMatch(/^@repeat98 tapehead was merged without owner review, .*\/compare\/b{40}\.\.\.a{40}$/)
  })
})
