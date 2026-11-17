// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newConfiguration } from '../config/workspace'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { pendingReask, resetReask, settleReask } from '../community/diagnostics-reask'
import { OctatrackHub } from './OctatrackHub'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }

// The unit's log says its DSP stalled (useOctatrackLoad reads it); the hub's line and the question after it are tested here.
const load = vi.hoisted(() => ({ stopped: true }))
vi.mock('../hooks/useOctatrackLoad', async original => ({ ...await original<typeof import('../hooks/useOctatrackLoad')>(), useOctatrackLoad: () => ({ points: [], notice: '', now: 0, ready: true, unsupported: false, stopped: load.stopped, clear: () => {} }) }))
vi.mock('./OctatrackDiagnostics', () => ({ OctatrackDiagnosticsSettings: () => null }))

let state: LinkState
const listeners = new Set<() => void>()
const link = { getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, start: () => () => {}, health: async () => undefined, liveLoad: async () => undefined, savedBackup: async () => undefined } as unknown as OctatrackLink
const ready = (active: string): LinkState => ({ status: 'ready', identity: { canSubmit: true, base: baseBinding.identity, model: 'OCTATRACK MKII' }, active })
const callbacks = { onSelect: vi.fn(), onSync: vi.fn(), onInstall: vi.fn(), onNew: vi.fn(), onImport: vi.fn(), onSetAction: vi.fn(), onFill: vi.fn(), onSaveUnit: vi.fn(), onReport: vi.fn() }
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); resetReask(); load.stopped = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); localStorage.clear() })
const render = () => act(() => root.render(createElement(OctatrackHub, { ...callbacks, view: 'status', link, sets: [newConfiguration('Live', ['miniverb'])], header: null, grid: null, card: null })))
const move = (next: LinkState) => act(() => { state = next; listeners.forEach(listener => listener()) })

describe('a connected Octatrack whose audio stopped', () => {
  it('offers the diagnostics question once for that base and running set', async () => {
    state = ready('a'.repeat(64)); await render()
    expect(container.textContent).toContain('DSP stopped')
    expect(pendingReask()).toMatchObject({ reason: 'stall', key: 'stall:' + baseBinding.identity + ':' + 'a'.repeat(64) })
    settleReask() // answered: nothing waits, and this stall stays asked about
    await move({ ...ready('a'.repeat(64)) }) // the same stall, still showing
    expect(pendingReask()).toBeUndefined()
    await move(ready('b'.repeat(64))) // another running set
    expect(pendingReask()).toMatchObject({ reason: 'stall', key: 'stall:' + baseBinding.identity + ':' + 'b'.repeat(64) })
  })
  it('asks nothing while the audio runs', async () => {
    load.stopped = false; state = ready('a'.repeat(64)); await render()
    expect(pendingReask()).toBeUndefined()
  })
})
