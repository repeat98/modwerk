// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModuleGrid } from './ModuleGrid'
import { MODULES } from '../catalog/modules'

describe('the module tiles on the Octatrack page', () => {
  // A tester's unit carried a module the library does not have: its tile threw while rendering (DETAILS[id].label).
  it('shows a module on the unit that is not in the library, without its artwork', () => {
    const known = MODULES[0].id, none = () => {}
    const html = renderToStaticMarkup(createElement(ModuleGrid, { ids: [known], inventory: { moduleIds: [known, 'private-build'], removedStockFx: [] },
      describe: () => '', onOpen: none, onRemove: none, onKeep: none, onSaveUnit: none }))
    expect(html).toContain('private-build')
    expect(html).toContain('Not in the library')
  })
})
