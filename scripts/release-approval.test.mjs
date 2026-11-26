import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { maintainerApproval, readMaintainers, verifyUnreleased } from './release-approval.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-unreleased-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Modwerk test'); git('config', 'user.email', 'modwerk-test@example.test')
  const commit = (message, file = message.replace(/\W+/g, '-')) => { writeFileSync(join(root, file), message); git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  return { root, git, commit }
}
// Approves every commit but those named, as fetchReleaseApproval would refuse a self-merge.
const approvingAllBut = (...refused) => { const seen = []; const check = async (_repo, commit) => { seen.push(commit); if (refused.includes(commit)) throw new Error('No owner-merged PR approves this exact main commit') }; return { check, seen } }

describe('every main commit since the last release needs its own approval', () => {
  it('checks each commit between the last release and the newest, the newest left to the caller', async () => {
    const { root, commit } = repo(), last = commit('released'), a = commit('Fix: one (#1)'), head = commit('Fix: two (#2)')
    const { check, seen } = approvingAllBut()
    expect(await verifyUnreleased({ repository: 'o/r', last, head, ownerId: 1, root, check })).toEqual([a])
    expect(seen).toEqual([a])
  })
  it('refuses a release that would publish a commit nobody approved, naming it', async () => {
    const { root, commit } = repo(), last = commit('released'), selfMerged = commit('New module 0.1.0 (#1937)'), head = commit('Fix: owner merge (#1940)')
    const { check } = approvingAllBut(selfMerged)
    await expect(verifyUnreleased({ repository: 'o/r', last, head, ownerId: 1, root, check })).rejects.toThrow(selfMerged.slice(0, 9) + ' "New module 0.1.0 (#1937)"')
  })
  it('lets an unapproved commit through once a later commit in the range reverts it', async () => {
    const { root, git, commit } = repo(), last = commit('released'), selfMerged = commit('New module 0.1.0 (#1937)')
    git('revert', '--no-edit', selfMerged); const head = git('rev-parse', 'HEAD')
    const { check, seen } = approvingAllBut(selfMerged)
    expect(await verifyUnreleased({ repository: 'o/r', last, head, ownerId: 1, root, check })).toEqual([])
    expect(seen).toEqual([])
  })
  it('checks merges on main, not the commits of the merged branch', async () => {
    const { root, git, commit } = repo(), last = commit('released')
    git('checkout', '-qb', 'topic'); const branchCommit = commit('work on a branch')
    git('checkout', '-q', 'main'); git('merge', '-q', '--no-ff', '-m', 'Merge pull request #3', 'topic'); const merge = git('rev-parse', 'HEAD')
    const head = commit('Fix: after (#4)')
    const { check, seen } = approvingAllBut(branchCommit)
    expect(await verifyUnreleased({ repository: 'o/r', last, head, ownerId: 1, root, check })).toEqual([merge])
    expect(seen).toEqual([merge])
  })
  it('checks nothing more without a last release', async () => {
    const { check, seen } = approvingAllBut()
    expect(await verifyUnreleased({ repository: 'o/r', last: '', head: 'a'.repeat(40), ownerId: 1, root: tmpdir(), check })).toEqual([])
    expect(seen).toEqual([])
  })
})

describe('a maintainer the owner listed may merge into main', () => {
  const commit = 'c'.repeat(40), maintainers = new Map([[833410, 'npp1993']])
  const pr = (merger = { id: 833410, login: 'npp1993' }) => ({ number: 2206, merged: true, state: 'closed', base: { ref: 'main', repo: { full_name: 'o/r' } },
    merged_by: merger, merge_commit_sha: commit, merged_at: '2026-11-25T23:21:25Z' })
  const merged = (actor = 833410) => [{ event: 'merged', commit_id: commit, actor: { id: actor } }]
  const approve = (overrides = {}) => maintainerApproval({ repository: 'o/r', commit, pr: pr(), merges: merged(), changed: ['docs/module-guides/README.md'], maintainers, ownerId: 1, ...overrides })
  it('approves their merge of exactly this commit', () => {
    expect(approve()).toMatchObject({ pullRequest: 2206, mergedBy: 'npp1993', mergedById: 833410, authorization: 'maintainer', sourceCommit: commit })
  })
  it('refuses anyone not listed, or a listed id under another login', () => {
    expect(approve({ pr: pr({ id: 42, login: 'someone' }) })).toBeNull()
    expect(approve({ pr: pr({ id: 833410, login: 'renamed' }) })).toBeNull()
  })
  it('refuses a merge recorded for another commit or by another actor', () => {
    expect(approve({ merges: [{ event: 'merged', commit_id: 'd'.repeat(40), actor: { id: 833410 } }] })).toBeNull()
    expect(approve({ merges: merged(42) })).toBeNull()
  })
  it('leaves changes to the maintainer list and the release gate to the owner', () => {
    for (const path of ['sdk/approvals/release-maintainers.json', 'sdk/approvals/euclid-build-approval.json', 'scripts/release-approval.mjs', 'src/release/approval.ts', '.github/workflows/pages.yml'])
      expect(approve({ changed: ['docs/a.md', path] })).toBeNull()
  })
  it('reads the committed list, and none from a checkout without one', () => {
    expect(readMaintainers(process.cwd()).get(833410)).toBe('npp1993')
    expect(readMaintainers(tmpdir()).size).toBe(0)
  })
})
