import { describe, expect, it, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectFirstRelease } from './first-release.mjs'
import { mergeCommand, currentApproval, mergeReviewed } from './review-merge.mjs'

const roots = [], reviewer = { login: 'tester', id: 42, type: 'User' }, author = { login: 'maker', id: 77, type: 'User' }
const repo = 'org/repo', profile = 'sdk/machines/digitakt/machine.json', registry = '.github/module-authors.json'
const manifest = 'sdk/digitakt/modules/example/modwerk.module.json'
const draft = { machine: 'digitakt', id: 'example', version: '1.0.0', author: { github: 'maker' } }
const event = head => ({ action: 'created', sender: reviewer, issue: { number: 3, pull_request: {} }, comment: { user: reviewer, body: '/modwerk merge ' + head } })
afterEach(() => roots.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

function fixture(edits = {}, baseFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-device-review-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
  function commit(files) {
    for (const [name, value] of Object.entries(files)) {
      const path = join(root, name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(value))
    }
    git('add','.'); git('commit','-qm','fixture')
    return git('rev-parse','HEAD')
  }
  git('init','-q'); git('config','user.name','Fixture'); git('config','user.email','test@example.com')
  const base = commit({ [profile]: { id: 'digitakt', sdk: { modules: 'sdk/digitakt/modules', platform: 'elemod' }, deviceReviewers: [42] },
    [registry]: { schemaVersion: 1, accounts: { owner: 99 } }, ...baseFiles })
  const head = commit({ [registry]: { schemaVersion: 1, accounts: { owner: 99, maker: 77 } }, [manifest]: draft,
    'src/community/module-changelogs/digitakt-example.json': [], ...edits })
  git('update-ref','refs/pull/3/head',head); git('remote','add','origin',root); git('checkout','-q',base)
  return { root, base, head, inspect: () => inspectFirstRelease(root,base,head,author,reviewer) }
}

describe('device-scoped first releases', () => {
  it('registers the submitting modder in the same release and accepts already registered authors', () => {
    expect(fixture().inspect()).toEqual({ machine: 'digitakt', module: 'digitakt-example', registered: true })
    expect(fixture({}, { [registry]: { schemaVersion: 1, accounts: { owner: 99, maker: 77 } } }).inspect().registered).toBe(false)
  })
  it('accepts native package imports only for the new module and its device', () => {
    const name = 'example-1.0.0.elemod', target = { device:'digitakt-mk1' }
    const files = {
      'sdk/imports/elekloader-example.json': { cores:[],mods:[{ id:'example',device:target.device,version:'1.0.0',file:name }] },
      'sdk/imports/example.json': { module:'digitakt/example' },
      ['vendor/elekloader/catalog/'+name]: { id:'example',version:'1.0.0',target },
    }
    expect(fixture(files).inspect().machine).toBe('digitakt')
    files['vendor/elekloader/catalog/'+name].target = { device:'digitone-mk1' }
    expect(fixture(files).inspect).toThrow('identity')
  })
  it.each([
    [{ 'sdk/digitone/modules/other/x.c': 'foreign' }, {}],
    [{ 'sdk/digitakt/core/change.c': 'shared' }, {}],
    [{ [registry]: { schemaVersion: 1, accounts: { owner: 99, maker: 12 } } }, {}],
    [{ [registry]: { schemaVersion: 1, accounts: { maker: 77 } } }, {}],
    [{ [registry]: { schemaVersion: 1, accounts: { owner: 99, maker: 77, extra: 23 } } }, {}],
    [{ [profile]: { id: 'digitakt', deviceReviewers: [42] } }, { [profile]: { id: 'digitakt', sdk: { modules: 'sdk/digitakt/modules' }, deviceReviewers: [43] } }],
    [{ [manifest]: { ...draft, maintainers: ['Tester'] } }, {}],
    [{ [manifest]: { ...draft, author: { github:'maker', contributors:[{github:'tester'}] } } }, {}],
    [{ [manifest]: { ...draft, author: { github: 'elsewhere' } } }, {}],
    [{ [manifest]: { ...draft, tests: { releaseWaiver: true } } }, {}],
    [{}, { [manifest]: { ...draft, version: '0.0.1' } }],
    [{ 'sdk/imports/elekloader-example.json': { cores: [], mods: [{ id: 'example', file: 'other.elemod', device: 'digitone-mk1' }] } }, {}],
  ])('rejects changes outside the assignment or registration', (changes, base) => {
    expect(fixture(changes,base).inspect).toThrow()
  })
  it('requires the original sender and their latest independent approval at the exact commit', () => {
    const head = 'a'.repeat(40), approved = { id: 19, state: 'APPROVED', user: reviewer, commit_id: head }
    expect(mergeCommand(event(head))).toMatchObject({ head, number: 3 })
    expect(() => mergeCommand({ ...event(head), action: 'edited' })).toThrow()
    expect(() => mergeCommand({ ...event(head), sender: author })).toThrow()
    expect(currentApproval([approved],42,head)).toBe(19)
    for (const state of ['DISMISSED','CHANGES_REQUESTED']) expect(() => currentApproval([approved,{ ...approved,state }],42,head)).toThrow()
    expect(() => currentApproval([approved],42,'b'.repeat(40))).toThrow()
  })
  it.each([['read','device-reviewer'],['write','maintainer']])('uses the existing worker with the live %s role and checked CI', async (permission, role) => {
    const { root,base,head } = fixture(), review = { id: 19, state: 'APPROVED', user: reviewer, commit_id: head }
    const pr = { state: 'open', draft: false, base: { ref: 'main', repo: { full_name: repo }, sha: base }, head: { sha: head,ref:'first-release',repo:{full_name:'maker/repo'} }, user: author }
    const results = {
      '/pulls/3': pr, '/pulls/3/reviews?per_page=100&page=1': [review], '/collaborators/tester/permission': { permission, user: reviewer },
      ['/actions/workflows/module-pr.yml/runs?event=pull_request&status=action_required&head_sha='+head+'&per_page=1']: { workflow_runs:[] },
      '/actions/workflows/module-pr.yml': { id: 51 }, ['/actions/workflows/51/runs?event=pull_request&head_sha='+head+'&per_page=1']: { workflow_runs: [
        { id: 98, head_sha: head, status: 'completed', conclusion: 'success', workflow_id: 51, repository: { full_name: repo }, path: '.github/workflows/module-pr.yml', event: 'pull_request' }] },
      '/actions/runs/98/jobs?filter=latest&per_page=100&page=1': { jobs: ['scope / '+base+' / '+head,'module-contract','elemod-source','octatrack-source','module-pr-ok'].map(name => ({ name,status:'completed',conclusion:'success' })) },
      '/git/ref/heads/main': { object: { sha: base } },
    }
    const api = vi.fn(path => Promise.resolve(results[path])), bot = vi.fn(async path => path === '/state' ? { paused:false } : { sha: 'abc' })
    await mergeReviewed({ event:event(head), repository:repo, api, bot, root })
    expect(bot).toHaveBeenCalledWith('/merge/reviewed','POST',expect.objectContaining({ number:3, sha:head, review: expect.objectContaining({ role,base,actorId:42,id:19,checkRun:98 }) }))
    results['/git/ref/heads/main'].object.sha = 'f'.repeat(40)
    await expect(mergeReviewed({ event:event(head), repository:repo, api, bot, root })).rejects.toThrow('Main changed')
    expect(bot).toHaveBeenCalledTimes(1)
    results['/git/ref/heads/main'].object.sha = base
    const held = { id:71,event:'pull_request',head_sha:head,head_branch:pr.head.ref,head_repository:pr.head.repo,repository:pr.base.repo,
      path:'.github/workflows/module-pr.yml',pull_requests:[] }
    results['/actions/workflows/module-pr.yml/runs?event=pull_request&status=action_required&head_sha='+head+'&per_page=1'].workflow_runs.push(held)
    api.mockClear(); bot.mockClear()
    await mergeReviewed({ event:event(head), repository:repo, api, bot, root })
    expect(api).toHaveBeenCalledWith('/actions/runs/71/approve','POST')
    expect(bot.mock.calls).toEqual([['/state']])
    held.head_repository = { full_name:'other/repo' }
    api.mockClear()
    await expect(mergeReviewed({ event:event(head), repository:repo, api, bot, root })).rejects.toThrow('does not match')
    expect(api).not.toHaveBeenCalledWith('/actions/runs/71/approve','POST')
  })
})
