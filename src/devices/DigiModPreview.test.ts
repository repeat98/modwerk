import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DIGI_MODS, digiModuleDocument } from './digi-mods'
import { DigiModPreview } from './DigiModPreview'

describe('Digitakt and Digitone module previews', () => {
  it('show each module\'s own saved thumbnail, at the path the build publishes it', () => {
    for (const mod of DIGI_MODS) {
      const document = digiModuleDocument(mod), thumbnail = document.media.find(item => item.kind === 'thumbnail')!
      const html = renderToStaticMarkup(createElement(DigiModPreview, { mod }))
      expect(html, mod.device + '/' + mod.id).toContain('module-media/' + mod.device + '-' + mod.id + '/' + document.version + '/' + thumbnail.path)
      const file = fileURLToPath(new URL('../../sdk/' + mod.device + '/modules/' + mod.id + '/' + thumbnail.path, import.meta.url))
      expect(existsSync(file), file + ' is missing').toBe(true)
    }
  })
})
