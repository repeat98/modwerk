// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PAUSED_MODULE_NOTICES, pausedBlock } from '../catalog/availability'
import { MODULES } from '../catalog/modules'
import { ModuleCard } from './ModuleCard'
import { ModuleDetail } from './ModuleDetail'
import { ModuleGrid } from './ModuleGrid'

const poly8 = MODULES.find(module => module.id === 'poly8')!, notice = PAUSED_MODULE_NOTICES.poly8
const none = () => {}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe('a paused module that stays listed', () => {
  it('shows its library card with a locked add button and the reason', async () => {
    const toggle = vi.fn()
    await act(() => root.render(createElement(ModuleCard, { module: poly8, selected: false, baseline: null, compared: false, canCompare: true, onToggle: toggle, onCompare: none, block: pausedBlock('poly8') })))
    const button = container.querySelector<HTMLButtonElement>('.add-button')!
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Paused')
    expect(button.title).toBe(notice.detail)
    expect(container.querySelector('.add-block-chip')?.textContent).toBe(notice.reason)
    button.click()
    expect(toggle).not.toHaveBeenCalled()
  })

  it('explains the pause on its page beside a locked add button', () => {
    const html = renderToStaticMarkup(createElement(ModuleDetail, { module: poly8, selected: false, onToggle: none, addBlock: pausedBlock('poly8') }))
    expect(html).toMatch(/<button class="[^"]*is-blocked" disabled=""/)
    expect(html).toContain(notice.reason)
    expect(html).toContain('<p class="add-block-detail">' + notice.detail + '</p>')
    expect(html).not.toContain('Add to ')
  })

  it('still lets a member remove it from a set that already has it', () => {
    const html = renderToStaticMarkup(createElement(ModuleDetail, { module: poly8, selected: true, onToggle: none, addBlock: pausedBlock('poly8') }))
    expect(html).not.toContain('is-blocked')
    expect(html).toContain('aria-pressed="true"')
  })

  it('lets it leave the unit but not be kept in the set', () => {
    const html = renderToStaticMarkup(createElement(ModuleGrid, { ids: ['euclid'], inventory: { moduleIds: ['poly8'], removedStockFx: [] }, describe: () => '', onRemove: none, onKeep: none }))
    expect(html).toContain('disabled="" aria-label="Keep POLY8: ' + notice.detail + '"')
  })
})
