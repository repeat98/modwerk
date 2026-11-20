import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ZoomEffectPreview } from './ZoomEffectDetail'
import { ZOOM_EFFECTS, zoomEffectThumbnail } from './zoom-effects'

describe('Zoom effect preview', () => {
  it.each(['loop', 'mangle', 'microloom', 'scope', 'scorch', 'spectrum', 'stasis'])('shows the matching animation for %s with a still fallback', id => {
    const effect = ZOOM_EFFECTS.find(item => item.id === id)!
    const html = renderToStaticMarkup(createElement(ZoomEffectPreview, { effect }))
    expect(html).toContain('media="(prefers-reduced-motion: no-preference)"')
    expect(html).toContain('/' + id + '.webp')
    expect(html).toContain(zoomEffectThumbnail(effect))
  })

  it('uses the module thumbnail for an effect without an animation', () => {
    const effect = { ...ZOOM_EFFECTS[0], id: 'new-effect' }
    const html = renderToStaticMarkup(createElement(ZoomEffectPreview, { effect, compact: true }))
    expect(html).not.toContain('<source')
    expect(html).toContain(zoomEffectThumbnail(effect))
  })
})
