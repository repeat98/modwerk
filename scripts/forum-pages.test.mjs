import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchForumThreads, forumPages, forumThreadPageHtml, threadCard } from './forum-pages.ts'
import { wrapTitle } from './social-cards.ts'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('%BASE_URL%', './')
const id = '0f3a1b2c-4d5e-4f60-8a9b-0c1d2e3f4a5b'
const thread = { id, title: 'Granular pad from "Tapehead"', category: 'showcase', machine: 'octatrack', username: 'synth_fan', created_at: '2026-10-01 10:00:00', updated_at: '2026-10-02 10:00:00', replies: 3, excerpt: 'Here is how it sounds <with> a long tail.', image: null }
const api = 'https://community.example.test/api'
afterEach(() => vi.unstubAllGlobals())

it('provides thread cards to crawlers and loads the app relative to the thread path', () => {
  const page = forumThreadPageHtml(html, thread, './')
  expect(page).toContain('<base href="../../../" />')
  expect(page).toContain('<title>Granular pad from &quot;Tapehead&quot; · Modwerk forum</title>')
  expect(page).toContain('<link rel="canonical" href="https://modwerk.app/forum/thread/' + id + '-granular-pad-from-tapehead/" />')
  expect(page).toContain('<meta property="og:url" content="https://modwerk.app/forum/thread/' + id + '-granular-pad-from-tapehead/" />')
  expect(page).toContain('<meta property="og:type" content="article" />')
  expect(page).toContain('<meta name="description" content="Here is how it sounds &lt;with&gt; a long tail." />')
  expect(page).toContain('<meta name="twitter:description" content="Here is how it sounds &lt;with&gt; a long tail." />')
  expect(page).toContain('modwerk-social-preview-v2.jpg')
  expect(page).toContain('<h1>Granular pad from &quot;Tapehead&quot;</h1>')
  expect(page).toContain('<p>Here is how it sounds &lt;with&gt; a long tail.</p>')
  expect(page.match(/rel="canonical"/g)).toHaveLength(1)
  expect(forumThreadPageHtml(html, thread, '/octamod/')).toContain('<base href="/octamod/" />')
  expect(forumThreadPageHtml(html, thread, '/octamod/')).toContain('content="https://modwerk.app/octamod/forum/thread/' + id + '-granular-pad-from-tapehead/"')
})

it('uses the first public image as the card and describes a thread without text by its topic', () => {
  const page = forumThreadPageHtml(html, { ...thread, excerpt: '', image: api + '/forum/media/abc' }, './')
  expect(page).toContain('<meta property="og:image" content="https://community.example.test/api/forum/media/abc" />')
  expect(page).toContain('<meta name="twitter:image" content="https://community.example.test/api/forum/media/abc" />')
  expect(page).not.toContain('og:image:width')
  expect(page).not.toContain('modwerk-social-preview-v2.jpg')
  expect(page).toContain('content="A Showcase discussion started by @synth_fan on the Modwerk forum." />')
})

it('points a thread without a picture at its generated card', () => {
  const page = forumThreadPageHtml(html, thread, './', 'forum-thumbnails/x-abc.jpg')
  expect(page).toContain('<meta property="og:image" content="https://modwerk.app/forum-thumbnails/x-abc.jpg" />')
  expect(page).toContain('<meta name="twitter:image" content="https://modwerk.app/forum-thumbnails/x-abc.jpg" />')
  expect(page).not.toContain('modwerk-social-preview-v2.jpg')
  expect(forumThreadPageHtml(html, { ...thread, image: api + '/forum/media/abc' }, './', 'forum-thumbnails/x-abc.jpg')).toContain('forum/media/abc')
})

it('wraps long titles on word boundaries and renders a 1200 × 630 card', async () => {
  expect(wrapTitle('Short title')).toEqual(['Short title'])
  const lines = wrapTitle('A very long discussion title that keeps going and going well past three lines of the card layout')
  expect(lines).toHaveLength(3)
  expect(lines[2].endsWith('…')).toBe(true)
  expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(26)
  const { default: sharp } = await import('sharp')
  const meta = await sharp(await threadCard(thread, fileURLToPath(new URL('../', import.meta.url)), 'Modwerk')).metadata()
  expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'jpeg'])
})

it('emits the canonical page and plain ID alias, and skips the forum when the API is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ threads: [thread, { ...thread, id: 'module-miniverb', title: 'Miniverb discussion' }, { id: '../x', title: 'bad' }] })))
  const plugin = forumPages(api)
  plugin.configResolved({ root: fileURLToPath(new URL('../', import.meta.url)), base: './' })
  const assets = [], warnings = []
  await plugin.generateBundle.call({ emitFile(asset) { assets.push(asset) }, warn(message) { warnings.push(message) } }, {}, { 'index.html': { type: 'asset', source: html } })
  expect(String(fetch.mock.calls[0][0])).toBe('https://community.example.test/api/forum/pages.json')
  const names = assets.map(asset => asset.fileName)
  expect(names.filter(name => !name.startsWith('forum-thumbnails/'))).toEqual(['forum/thread/' + id + '-granular-pad-from-tapehead/index.html', 'forum/thread/' + id + '/index.html', 'forum/thread/module-miniverb/index.html'])
  expect(names.filter(name => name.startsWith('forum-thumbnails/'))).toHaveLength(2)
  const pages = assets.filter(asset => asset.fileName.endsWith('index.html'))
  expect(pages[0].source).toBe(pages[1].source)
  expect(pages[0].source).toContain('forum-thumbnails/' + id + '-')
  expect(warnings).toEqual([])

  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED') }))
  expect(await fetchForumThreads(api, message => warnings.push(message))).toEqual([])
  expect(warnings).toEqual(['Forum thread pages were skipped: connect ECONNREFUSED'])
  const offline = []
  await forumPages(undefined).generateBundle.call({ emitFile(asset) { offline.push(asset) }, warn() {} }, {}, { 'index.html': { type: 'asset', source: html } })
  expect(offline).toEqual([])
})
