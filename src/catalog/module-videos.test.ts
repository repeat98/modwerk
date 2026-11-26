import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModuleVideo } from '../components/ModuleVideo'
import { MODULE_DOCUMENTS_BY_ID } from './documents'
import { MODULE_VIDEO_SECTION, MODULE_VIDEOS } from './module-videos'

describe('module videos', () => {
  it.each(Object.entries(MODULE_VIDEOS))('%s points at a catalog module, a video ID and its own media', (id, video) => {
    const document = MODULE_DOCUMENTS_BY_ID[id]
    expect(document, id + ' is not in the catalog').toBeDefined()
    expect(video.youtube).toMatch(/^[A-Za-z0-9_-]{11}$/)
    expect(video.title.trim()).not.toBe('')
    expect(video.channel.trim()).not.toBe('')
    if (video.screen) expect(document.media.map(item => item.path)).toContain(video.screen)
  })

  it('draws a play card from the module\'s own art and requests nothing from YouTube until played', () => {
    const html = renderToStaticMarkup(createElement(ModuleVideo, { id: 'grain', authorName: 'A Force Truly Evil' }))
    expect(html).toContain('id="' + MODULE_VIDEO_SECTION + '"')
    expect(html).toContain('aria-label="Play Grain – A New Granular Engine for Elektron Octatrack from YouTube"')
    expect(html).toContain('by the author')
    expect(html).toContain('module-media/grain/' + MODULE_DOCUMENTS_BY_ID.grain.version + '/media/grain-full-screen.png')
    expect(html).not.toContain('<iframe')
    expect(html).not.toMatch(/src="https:\/\/[^"]*(youtube|ytimg)/)
    expect(html).toContain('href="https://www.youtube.com/watch?v=hxvbwbY6qoE"')
  })

  it('names the channel when someone other than the author published the video', () => {
    expect(renderToStaticMarkup(createElement(ModuleVideo, { id: 'grain', authorName: 'Someone else' }))).toContain('by A Force Truly Evil')
  })

  it('shows nothing for a module without a video', () => {
    const other = Object.keys(MODULE_DOCUMENTS_BY_ID).find(id => !MODULE_VIDEOS[id])!
    expect(renderToStaticMarkup(createElement(ModuleVideo, { id: other, authorName: '' }))).toBe('')
  })
})
