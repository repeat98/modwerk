import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ModuleRelease } from '../components/ModuleRelease'

it('renders the new and updated badges with their accessible explanations', () => {
 const module = { id: 'tapehead', version: '0.2.0-experimental' }
 const render = (baseline: readonly string[] | null, viewedVersion?: string) => renderToStaticMarkup(createElement(ModuleRelease, { module, baseline, viewedVersion }))
 expect(render([])).toContain('New<span class="sr-only"> since your first visit')
 expect(render([], '0.1.0-experimental')).toContain('Updated<span class="sr-only"> since you last viewed')
 expect(render([], '0.1.0-experimental')).not.toContain('>New<')
 for (const html of [render(null), render([module.id]), render([], module.version)]) {
  expect(html).not.toContain('module-update-badge')
  expect(html).toContain('aria-label="Module version 0.2.0-experimental"')
 }
})
