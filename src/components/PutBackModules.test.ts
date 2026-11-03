// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { rememberInventory, SAVED_BY_ANOTHER_BASE } from '../config/inventory'
import type { DiagnosticReading } from '../community/octatrack-diagnostics-contract'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { PutBackModules } from './PutBackModules'

const reading = (saved: number): DiagnosticReading => ({ state: 2, failed: 0, modules: 0, dsp: 0, intact: 0, ran: 0, cpu: 0, tracks1to4: 0, tracks5to8: 0, frameGap: 0, saved, savedCount: 0, live: 0, culprit: 0, refusal: 0 })
function unit(base: string, saved: number) {
  const state: LinkState = { status: 'ready', identity: { canSubmit: true, base, model: 'OCTATRACK MKII' } }
  return { getState: () => state, subscribe: () => () => {}, start: () => () => {}, health: vi.fn(async () => reading(saved)) } as unknown as OctatrackLink
}
const empty = { moduleIds: [], removedStockFx: [] }
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); vi.unstubAllGlobals(); localStorage.clear() })
const render = (link: OctatrackLink, waiting: boolean, onPutBack: () => void) => act(async () => root.render(createElement(PutBackModules, { link, inventory: empty, waiting, onPutBack })))

it('offers the modules from before a base change once per base, after other dialogs close', async () => {
  rememberInventory('old', { moduleIds: ['everb', 'poly8'], removedStockFx: [] }, '2026-10-20T10:00:00.000Z')
  const onPutBack = vi.fn(), updated = unit('new', SAVED_BY_ANOTHER_BASE)
  await render(updated, true, onPutBack)
  expect(onPutBack).not.toHaveBeenCalled() // the base install dialog is still open
  await render(updated, false, onPutBack)
  expect(onPutBack).toHaveBeenCalledTimes(1)
  expect(onPutBack.mock.calls[0][0]).toMatchObject({ base: 'old', moduleIds: ['everb', 'poly8'] })
  await render(updated, true, onPutBack); await render(updated, false, onPutBack)
  expect(onPutBack).toHaveBeenCalledTimes(1) // closed once: not again for this base
})

it('stays quiet when the card set loaded or nothing was saved', async () => {
  rememberInventory('old', { moduleIds: ['everb'], removedStockFx: [] }, '2026-10-20T10:00:00.000Z')
  const onPutBack = vi.fn()
  await render(unit('new', 1), false, onPutBack)
  await render(unit('other', 2), false, onPutBack)
  expect(onPutBack).not.toHaveBeenCalled()
})
