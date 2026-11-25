import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../catalog/modules'
import { ModulePreview } from './ModulePreview'

describe('module previews', () => {
  it('draws every catalog module, from hand-drawn art or its own presentation/thumbnail.svg', () => {
    for (const module of MODULES) {
      const html = renderToStaticMarkup(createElement(ModulePreview, { id: module.id }))
      expect(html).toContain('signal-art')
      if (!html.includes('presentation/thumbnail.svg')) continue
      const thumbnail = fileURLToPath(new URL('../../sdk/octatrack/modules/' + module.id + '/presentation/thumbnail.svg', import.meta.url))
      expect(existsSync(thumbnail), module.id + ' has no hand-drawn art, so it needs presentation/thumbnail.svg').toBe(true)
    }
  })
})
