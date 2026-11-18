import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { SITE_PAGES, sitePageHtml, sitePages } from './site-pages.ts'
import { EXTERNAL_PROJECTS } from '../src/projects/projects.ts'
import { SUBMIT_PREVIEW_ALT, SUBMIT_PREVIEW_IMAGE } from '../src/community/developer-guidance.ts'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('%BASE_URL%', './')

it('gives the page its own title, description, canonical URL and card', () => {
  const page = sitePageHtml(html, SITE_PAGES[0], './')
  expect(page).toContain('<base href="../" />')
  expect(page).toContain('<title>Start developing · Modwerk</title>')
  expect(page).toContain('<link rel="canonical" href="https://modwerk.app/submit/" />')
  expect(page).toContain('<meta property="og:url" content="https://modwerk.app/submit/" />')
  expect(page).toContain('<meta property="og:image" content="https://modwerk.app/submit-social-preview-v1.jpg" />')
  expect(page).toContain('<meta name="twitter:image" content="https://modwerk.app/submit-social-preview-v1.jpg" />')
  expect(page).toContain('<meta name="twitter:image:alt" content="' + SUBMIT_PREVIEW_ALT + '" />')
  expect(existsSync(new URL('../public/' + SUBMIT_PREVIEW_IMAGE, import.meta.url))).toBe(true)
  expect(page).not.toContain('modwerk-social-preview-v2.jpg')
  expect(page.match(/rel="canonical"/g)).toHaveLength(1)
  expect(page).toContain('<h1>Start developing</h1>')
  expect(page).toContain('Every first release is reviewed before it goes live.')
  expect(page).toContain('Test on your unit')
  expect(sitePageHtml(html, SITE_PAGES[0], '/octamod/')).toContain('<base href="/octamod/" />')
})

it('emits each page with its own artwork', () => {
  const plugin = sitePages()
  plugin.configResolved({ base: './' })
  const assets = []
  plugin.generateBundle.call({ emitFile(asset) { assets.push(asset) } }, {}, { 'index.html': { type: 'asset', source: html } })
  expect(assets.map(asset => asset.fileName)).toEqual(['submit/index.html', 'projects/index.html'])
  expect(assets[0].source).toContain('https://modwerk.app/submit-social-preview-v1.jpg')
  expect(assets[1].source).toContain('https://modwerk.app/projects-social-preview-v1.jpg')
})

it('prerenders every external link on a canonical directory page', () => {
  const page = sitePageHtml(html, SITE_PAGES.find(page => page.path === 'projects/'), './')
  expect(page).toContain('<h1>Other projects</h1>')
  expect(page).toContain('<link rel="canonical" href="https://modwerk.app/projects/" />')
  expect(page).toContain('These projects cannot be added to a Modwerk configuration.')
  expect(page).not.toContain('<h1>Start developing</h1>')
  for (const project of EXTERNAL_PROJECTS) expect(page).toContain('href="' + project.repository + '"')
})
