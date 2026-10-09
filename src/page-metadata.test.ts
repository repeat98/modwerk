// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { setPageMetadata } from './page-metadata'
import { PROJECT_PREVIEW_IMAGE, PROJECT_PREVIEW_ALT } from './projects/projects'

afterEach(() => { document.head.innerHTML = '' })

it('uses the directory preview across client navigation and restores the home preview on leaving', () => {
  document.head.innerHTML = '<base href="https://modwerk.app/project-base/"><meta property="og:url" content="https://modwerk.app/project-base/">'
  const project = { title: 'Other projects — Modwerk', description: 'Independent projects', url: 'https://modwerk.app/project-base/projects/', image: PROJECT_PREVIEW_IMAGE, imageAlt: PROJECT_PREVIEW_ALT }
  setPageMetadata(project)
  setPageMetadata(project)
  expect(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content).toBe('https://modwerk.app/project-base/' + PROJECT_PREVIEW_IMAGE)
  expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:image:alt"]')?.content).toBe(PROJECT_PREVIEW_ALT)
  setPageMetadata({ title: 'Modwerk', description: 'Modules', url: 'https://modwerk.app/project-base/' })
  expect(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content).toBe('https://modwerk.app/project-base/modwerk-social-preview-v2.jpg')
})
