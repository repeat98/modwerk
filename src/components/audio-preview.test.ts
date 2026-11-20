import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../catalog/modules'
import { AudioPreviewContext } from './audio-preview-context'
import { moduleAudioPreviews, waveformPeaks, type AudioPreviewClip } from './audio-preview'
import { ModuleCard } from './ModuleCard'
import { ModuleAudioDetailPreview } from './ModuleAudioPreview'

const clip: AudioPreviewClip = { id: 'clip', url: '/example.ogg', duration: 20, peaks: [.2, .5, 1, .4], credit: 'Contributor' }
const module = MODULES.find(item => item.id === 'quantizer')!
const card = () => createElement(ModuleCard, { module, selected: false, baseline: null, compared: false, canCompare: true, onToggle: () => {}, onCompare: () => {} })

describe('module audio previews', () => {
  it('retains the original card cover when there is no recording', () => {
    const markup = renderToStaticMarkup(card())
    expect(moduleAudioPreviews('unknown')).toEqual([])
    expect(markup).toContain('class="module-cover"')
    expect(markup).toContain('hover-info')
    expect(markup.slice(markup.indexOf('class="module-card-body"'))).not.toContain(module.description)
    expect(markup).not.toContain('audio-preview-player')
    expect(markup).not.toContain('audio-preview-hint')
  })

  it('keeps playback outside the navigation link and omits clip descriptions', () => {
    const markup = renderToStaticMarkup(createElement(AudioPreviewContext.Provider, { value: { clips: { quantizer: [clip] }, onAdd: () => {} } }, card()))
    expect(markup).toContain('module-audio-cover-link')
    expect(markup).toContain('title="' + module.description + '"')
    expect(markup.slice(markup.indexOf('class="module-card-body"'))).not.toContain(module.description)
    expect(markup.indexOf('</a>')).toBeLessThan(markup.indexOf('audio-player-play"'))
    expect(markup).toContain('preload="none"')
    expect(markup).not.toContain('autoplay')
    expect(markup).not.toContain('hover-info')
    expect(markup).not.toContain('<figcaption')
  })

  it('offers carousel navigation only for multiple clips and a submission action even without audio', () => {
    const render = (clips: AudioPreviewClip[]) => renderToStaticMarkup(createElement(AudioPreviewContext.Provider, { value: { clips: { quantizer: clips }, onAdd: () => {} } }, createElement(ModuleAudioDetailPreview, { id: 'quantizer', name: module.name })))
    expect(render([])).toContain('Add preview')
    expect(render([])).not.toContain('audio-preview-player')
    expect(render([clip])).not.toContain('Next audio preview')
    expect(render([clip, { ...clip, id: 'second' }])).toContain('Next audio preview')
    expect(render([clip, { ...clip, id: 'second' }])).not.toContain('autoplay')
  })

  it('computes peaks from both channels rather than a decorative random shape', () => {
    expect(waveformPeaks([new Float32Array([0, -.3, .1, 0]), new Float32Array([.8, .1, .2, -.6])], 2)).toEqual([expect.closeTo(.8), expect.closeTo(.6)])
    expect(waveformPeaks([], 80)).toEqual([])
    expect(waveformPeaks([new Float32Array()], 80)).toEqual([])
  })

})
