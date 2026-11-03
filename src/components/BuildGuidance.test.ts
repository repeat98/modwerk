// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirmwareBuildPanel } from './FirmwareBuildPanel'
import type { useFirmwareBuild } from '../hooks/useFirmwareBuild'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (name: string) => [...document.querySelectorAll('button')].find(button => button.textContent === name)!
const noop = () => {}

describe('build next-step guidance', () => {
  it('explains the risk acknowledgement when it is the remaining build step', async () => {
    const build = { key: 'selection', state: 'valid', build: vi.fn() } as unknown as ReturnType<typeof useFirmwareBuild>
    const props = { build, available: true, downloadsEnabled: true, firmwareReady: true, moduleCount: 1, riskAccepted: false, configurationName: 'Live', onExport: noop, exported: false, results: null }
    await act(() => root.render(createElement(FirmwareBuildPanel, props)))
    expect(container.querySelector('#engine-status')?.textContent).toContain('Accept the flashing risks above')
    expect(buttonNamed('Build firmware').disabled).toBe(true)
    await act(() => root.render(createElement(FirmwareBuildPanel, { ...props, riskAccepted: true })))
    expect(buttonNamed('Build firmware').disabled).toBe(false)
    await click(buttonNamed('Build firmware'))
    expect(build.build).toHaveBeenCalledOnce()
    await act(() => root.render(createElement(FirmwareBuildPanel, { ...props, downloadsEnabled: false })))
    expect(buttonNamed('Build firmware').disabled).toBe(true)
    expect(container.querySelector('#engine-status')?.textContent).toContain('awaiting verification')
    expect(container.querySelector('#engine-status')?.textContent).not.toContain('Accept the flashing risks')
  })
  it('asks before building a selection that fits only with the compact FX2 menu', async () => {
    const build = { key: 'selection', state: 'valid', report: { compactFx2: true }, build: vi.fn() } as unknown as ReturnType<typeof useFirmwareBuild>
    const props = { build, available: true, downloadsEnabled: true, firmwareReady: true, moduleCount: 3, riskAccepted: true, configurationName: 'Live', onExport: noop, exported: false, results: null }
    await act(() => root.render(createElement(FirmwareBuildPanel, props)))
    expect(container.textContent).toContain('No stock FX2 effects')
    expect(container.querySelector('#engine-status')?.textContent).toContain('fits only without the stock FX2 effects')
    expect(buttonNamed('Build firmware').disabled).toBe(true)
    await click(container.querySelector('input[type="checkbox"]')!)
    expect(buttonNamed('Build firmware').disabled).toBe(false)
    // Another selection asks again.
    await act(() => root.render(createElement(FirmwareBuildPanel, { ...props, build: { ...build, key: 'other' } })))
    expect(buttonNamed('Build firmware').disabled).toBe(true)
  })
})
