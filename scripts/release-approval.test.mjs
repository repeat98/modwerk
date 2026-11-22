import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyUnreleased } from './release-approval.mjs'

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
