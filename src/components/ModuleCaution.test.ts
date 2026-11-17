import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODULES } from '../catalog/modules'
import { MODULE_CAUTIONS } from '../catalog/module-cautions'
import { CautionBadge } from './ModuleCard'

describe('heavy module caution', () => {
  it('flags POLY8, FM Synth, SYNTIZ and Tape Echo, and only modules in the catalog', () => {
    expect(Object.keys(MODULE_CAUTIONS).sort()).toEqual(['poly8', 'synth', 'syntiz', 'tapeecho'])
    for (const id of Object.keys(MODULE_CAUTIONS)) expect(MODULES.some(module => module.id === id)).toBe(true)
  })

  it('shows a warning badge with the reason readable by screen readers', () => {
    const html = renderToStaticMarkup(createElement(CautionBadge, { id: 'poly8' }))
    expect(html).toContain('module-caution-badge')
    expect(html).toContain('Heavy CPU')
    expect(html).toContain('<span class="sr-only">: Very CPU-intensive and may still be unstable.')
  })

  it('shows nothing for a module without a caution', () => {
    expect(renderToStaticMarkup(createElement(CautionBadge, { id: 'miniverb' }))).toBe('')
  })
})
