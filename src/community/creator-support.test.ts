import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { COMMUNITY_MODULES, communityModule } from './modules'
import { withDigitoneTwin } from '../devices/digi-twin.fixture'
import { defaultCreatorSupport, koFiEmbedUrl, koFiUrl } from './creator-support'
import { CreatorSupport, CreatorSupportButton } from './CreatorSupport'
import { apiFetch } from './api'
import { CreatorSupportDialog } from './CreatorSupportDialog'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.unstubAllGlobals() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const developerToken = 'd'.repeat(64), memberToken = 'b'.repeat(64)
  Object.assign(server.env, { GITHUB_OAUTH_CLIENT_ID: 'support-test', GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-client-secret', GITHUB_OAUTH_CALLBACK_URL: 'https://api.example.test/api/developer/auth/callback' })
  server.db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run('developer', 'Developer', '42', 'gdeo607')
  server.db.prepare('INSERT INTO developer_sessions(token_hash,user_id,client_hash,expires) VALUES(?,?,?,?)').run(await digest(developerToken), 'developer', await digest('support-test:synthetic-client-secret'), Math.floor(Date.now() / 1000) + 600)
  // A matching forum username alone never grants developer ownership.
  server.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run('member', 'Member', 'gdeo607')
  server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(memberToken), 'member', Math.floor(Date.now() / 1000) + 600)
  async function call(path: string, method = 'GET', body?: unknown, token = '', member = '', origin = 'https://octamod.test') {
    const headers = new Headers({ Origin: origin, 'CF-Connecting-IP': '192.0.2.1' })
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (token) headers.set('X-Modwerk-Developer', token)
    if (member) headers.set('Authorization', 'Bearer ' + member)
    return handleCommunity(new Request('https://api.example.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), server.env)
  }
  const claim = (id: string) => call('/developer/modules/' + id + '/claim', 'POST', {}, developerToken)
  const save = (id: string, koFiUrl: unknown, token = developerToken) => call('/modules/' + id + '/support', 'PATCH', { koFiUrl }, token)
  return { ...server, call, claim, save, developerToken, memberToken }
}

describe('creator support links', () => {
  it('normalizes Ko-fi pages and supports removing a link', () => {
    expect(koFiUrl(' https://www.ko-fi.com/music_maker/ ')).toBe('https://ko-fi.com/music_maker/')
    expect(koFiUrl('')).toBe('')
    expect(koFiUrl('  ')).toBe('')
  })
  it.each([
    'http://ko-fi.com/creator', 'javascript:alert(1)', 'https://ko-fi.com.evil.test/creator',
    'https://ko-fi.com@evil.test/creator', 'https://evil.test@ko-fi.com/creator', 'https://ko-fi.com:8443/creator',
    'https://ko-fi.com/', 'https://ko-fi.com/redirect/path', 'https://ko-fi.com/cre ator',
    'https://ko-fi.com\\@evil.test/creator', 'https://ko-fi.com/cre\nator', null, 123,
  ])('rejects invalid support link %j', value => { expect(() => koFiUrl(value)).toThrow('Enter a Ko-fi page URL') })

  it('persists separate links per machine, exposes only the public URL and removes the button’s destination', () => withDigitoneTwin(async () => {
    const f = await fixture()
    for (const id of ['digitakt-digiutils', 'digitone-digiutils']) expect((await f.claim(id)).status).toBe(201)
    expect((await f.save('digitakt-digiutils', 'https://ko-fi.com/creator')).status).toBe(200)
    expect((await f.save('digitone-digiutils', 'https://ko-fi.com/otherpage')).status).toBe(200)
    expect(await (await f.call('/modules/digitakt-digiutils/support')).json()).toEqual({ koFiUrl: 'https://ko-fi.com/creator', canEdit: false })
    expect(await (await f.call('/modules/digitone-digiutils/support', 'GET', undefined, f.developerToken)).json()).toEqual({ koFiUrl: 'https://ko-fi.com/otherpage', canEdit: true })
    expect((await f.save('digitakt-digiutils', '')).status).toBe(200)
    expect(await (await f.call('/modules/digitakt-digiutils/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
    expect(f.db.prepare('SELECT action FROM developer_events WHERE action LIKE ?').all('support-link-%').map(item => item.action)).toEqual(['support-link-updated', 'support-link-updated', 'support-link-removed'])
  }))

  it('requires a current verified claim and validates URLs and bodies on the server', async () => {
    const f = await fixture(), id = 'digitakt-digiutils'
    expect((await f.save(id, 'https://ko-fi.com/creator')).status).toBe(403)
    await f.claim(id)
    expect((await f.save(id, 'https://ko-fi.com/creator', '')).status).toBe(403)
    expect((await f.call('/modules/' + id + '/support', 'PATCH', { koFiUrl: 'https://ko-fi.com/creator' }, '', f.memberToken)).status).toBe(403)
    expect((await f.save('digiutils', 'https://ko-fi.com/creator')).status).toBe(404)
    expect((await f.save('miniverb', 'https://ko-fi.com/creator')).status).toBe(403)
    expect((await f.save(id, 'https://example.com/creator')).status).toBe(400)
    expect((await f.call('/modules/' + id + '/support', 'PATCH', { koFiUrl: 'https://ko-fi.com/creator', user_id: 'member' }, f.developerToken)).status).toBe(400)
    expect((await f.call('/modules/' + id + '/support', 'PATCH', { koFiUrl: 'https://ko-fi.com/creator' }, f.developerToken, '', 'https://evil.test')).status).toBe(403)
    expect((await f.call('/modules/' + id + '/support', 'DELETE', undefined, f.developerToken)).status).toBe(405)
    expect(f.db.prepare('SELECT * FROM module_creator_support').all()).toEqual([])
  })

  it('supports Octatrack author claims as well as machine-qualified Digi modules', async () => {
    const f = await fixture(), id = 'analog-bassdrum', author = communityModule(id)!.author
    f.db.prepare('UPDATE users SET github_login=? WHERE id=?').run(author, 'developer')
    expect((await f.claim(id)).status).toBe(201)
    expect((await f.save(id, 'https://ko-fi.com/ot_creator')).status).toBe(200)
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: 'https://ko-fi.com/ot_creator', canEdit: false })
  })


  it('already links the owner’s Ko-fi on every reviewed repeat98 module, without requiring a claim', async () => {
    const f = await fixture(), modules = COMMUNITY_MODULES.filter(module => module.author.toLowerCase() === 'repeat98')
    expect(modules.length).toBeGreaterThan(0)
    for (const module of modules) expect(await (await f.call('/modules/' + module.id + '/support')).json()).toEqual({ koFiUrl: 'https://ko-fi.com/jannikassfalg', canEdit: false })
    expect(await (await f.call('/modules/digitakt-digiutils/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
    expect(defaultCreatorSupport('REPEAT98')).toBe('https://ko-fi.com/jannikassfalg')
    expect(defaultCreatorSupport('Jannik Aßfalg')).toBe('')
  })

  it('persists removal of an owner default and lets its current maintainer replace it', async () => {
    const f = await fixture(), id = 'analog-bassdrum'
    f.db.prepare('UPDATE users SET github_login=? WHERE id=?').run('repeat98', 'developer')
    await f.claim(id)
    expect((await f.save(id, '')).status).toBe(200)
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
    expect(f.db.prepare('SELECT ko_fi_url FROM module_creator_support WHERE module_id=?').get(id)).toEqual({ ko_fi_url: '' })
    await f.save(id, 'https://ko-fi.com/new_page')
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: 'https://ko-fi.com/new_page', canEdit: false })
  })

  it('constructs only a validated Ko-fi embed and discards profile query overrides', () => {
    expect(koFiEmbedUrl('https://www.ko-fi.com/creator?redirect=elsewhere#fragment')).toBe('https://ko-fi.com/creator/?hidefeed=true&widget=true&embed=true')
    expect(koFiEmbedUrl('')).toBe('')
    expect(() => koFiEmbedUrl('https://evil.test/creator')).toThrow()
    const html = renderToStaticMarkup(createElement(CreatorSupportDialog, { url: 'https://ko-fi.com/creator', onClose: () => {} }))
    expect(html).toContain('src="https://ko-fi.com/creator/?hidefeed=true&amp;widget=true&amp;embed=true"')
    expect(html).toContain('title="Ko-fi tip panel"')
    expect(html).toContain('href="https://ko-fi.com/creator" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('allow-forms allow-popups')
  })

  it('sends developer credentials only to the dedicated support route when accessing public modules', async () => {
    const token = 'd'.repeat(64), headers: Headers[] = []
    vi.stubGlobal('localStorage', { getItem: (key: string) => key.startsWith('modwerk.developer.session:') ? token : '' })
    vi.stubGlobal('sessionStorage', { getItem: () => '' })
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => { headers.push(new Headers(options.headers)); return Response.json({}) })
    await apiFetch('/modules/miniverb/support')
    await apiFetch('/modules/miniverb/support', { method: 'PATCH' })
    await apiFetch('/modules/miniverb')
    await apiFetch('/catalog')
    expect(headers.map(value => value.get('X-Modwerk-Developer'))).toEqual([token, token, null, null])
  })

  it('hides links and rejects edits after revocation, suspension or catalog removal', async () => {
    const f = await fixture(), id = 'digitakt-digiutils', module = communityModule(id)!, maintainers = module.maintainers
    await f.claim(id); await f.save(id, 'https://ko-fi.com/creator')
    f.db.prepare('UPDATE module_maintainers SET revoked=1 WHERE module_id=?').run(id)
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
    expect((await f.save(id, 'https://ko-fi.com/elsewhere')).status).toBe(403)
    f.db.prepare('UPDATE module_maintainers SET revoked=0 WHERE module_id=?').run(id)
    f.db.prepare('UPDATE users SET suspended=1 WHERE id=?').run('developer')
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
    f.db.prepare('UPDATE users SET suspended=0 WHERE id=?').run('developer')
    try {
      module.maintainers = ['another-developer']
      expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: '', canEdit: false })
      expect((await f.save(id, 'https://ko-fi.com/elsewhere')).status).toBe(403)
    } finally { module.maintainers = maintainers }
  })

  it('lets a legacy published contribution’s verified owner manage support, and hides withdrawn publications', async () => {
    const f = await fixture(), id = 'community-filter'
    f.db.prepare("INSERT INTO submissions(id,owner_id,module_id,title,repository_url,description,usage,test_report_url,stress_notes,quality_notes,resource_notes,license,status) VALUES('contribution','member',?,'Filter','https://github.com/example/filter','Filter','Use it','https://github.com/example/filter','Stress','Quality','Resources','MIT','approved')").run(id)
    f.db.prepare('INSERT INTO module_publications(module_id,submission_id) VALUES(?,?)').run(id, 'contribution')
    expect((await f.call('/modules/' + id + '/support', 'PATCH', { koFiUrl: 'https://ko-fi.com/owner' }, '', f.memberToken)).status).toBe(200)
    expect(await (await f.call('/modules/' + id + '/support')).json()).toEqual({ koFiUrl: 'https://ko-fi.com/owner', canEdit: false })
    f.db.prepare('DELETE FROM module_publications WHERE module_id=?').run(id)
    expect((await f.call('/modules/' + id + '/support')).status).toBe(404)
  })

  it('renders accessible cup buttons without loading an embed, and reserves the support slot', () => {
    const html = renderToStaticMarkup(createElement(CreatorSupportButton, { url: 'https://ko-fi.com/creator' }))
    expect(html).toContain('Support the creator')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('class="ko-fi-heart"')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<script')
    expect(renderToStaticMarkup(createElement(CreatorSupportButton, { url: 'javascript:alert(1)' }))).toBe('')
    expect(renderToStaticMarkup(createElement(CreatorSupport, { id: 'digitakt-digiutils' }))).toBe('<div class="creator-support-slot"> </div>')
    expect(renderToStaticMarkup(createElement(CreatorSupport, { id: 'analog-bassdrum' }))).toContain('Support the creator on Ko-fi')
  })
})
