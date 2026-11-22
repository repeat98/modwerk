// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ModulePreview } from './ModulePreview'
import { MODULES } from '../catalog/modules'
import { DigiModPreview } from '../devices/DigiModPreview'
import { DIGI_MODS } from '../devices/digi-mods'
import { ZoomEffectPreview } from '../devices/ZoomEffectDetail'
import { ZOOM_EFFECTS } from '../devices/zoom-effects'

it('shows artwork without a title overlay on module thumbnails across devices', () => {
  const previews = [
    ...MODULES.map(mod => createElement(ModulePreview, { id: mod.id })),
    ...DIGI_MODS.map(mod => createElement(DigiModPreview, { mod })),
    ...ZOOM_EFFECTS.map(effect => createElement(ZoomEffectPreview, { effect })),
  ]
  for (const preview of previews) {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(preview), 'text/html')
    expect(doc.querySelector('.signal-art')).toBeTruthy()
    expect(doc.querySelector('.preview-label')?.textContent ?? '').toBe('')
  }
})
