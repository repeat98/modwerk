// @vitest-environment jsdom
// The hosted base (docs/HOSTED_BASES.md) on a machine whose modules link into its OS: offered only for a selection with
// no modules while no OS file is chosen, behind the risk and recovery ticks, and only for the identity the site builds.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DigiBuildPanel } from './DigiBuildPanel'
import { baseIdentity } from '../engine/elekloader/machine-build'
import type { useDigiFirmware } from '../hooks/useDigiFirmware'

const mocks = vi.hoisted(() => ({ images: [] as object[], download: vi.fn(async () => ({ buffer: new ArrayBuffer(4), sha256: 'b'.repeat(64) })) }))
vi.mock('../community/usage', () => ({ trackFirmwareDownload: vi.fn() }))
vi.mock('../hooks/useDigiBuild', () => ({ useDigiBuild: () => ({ state: { phase: 'idle' }, check: vi.fn(), build: vi.fn(), cancel: vi.fn() }) }))
vi.mock('../config/hosted-bases', () => ({ hostedBases: async () => mocks.images, downloadHostedBase: mocks.download }))
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); mocks.download.mockClear() })
const machine = 'analog-rytm-mkii' as const
const entry = (identity = baseIdentity(machine, [])!) => ({ machine, identity, sha256: 'b'.repeat(64), size: 4, file: 'Modwerk-analog-rytm-mkii-base-x.syx' })
const render = async (moduleIds: string[] = []) => { await act(() => root.render(createElement(DigiBuildPanel, {
  device: { id: machine, name: 'Analog Rytm MKII' }, firmware: { state: 'empty' } as ReturnType<typeof useDigiFirmware>,
  moduleIds, onExport: vi.fn(), exported: false, canExport: false, results: null }))); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
const button = () => [...container.querySelectorAll('button')].find(item => item.textContent?.includes('Download Modwerk base'))

describe('the hosted base on the build panel', () => {
  it('downloads the base without an OS file once the risk and the way back are ticked', async () => {
    mocks.images = [entry()]; await render()
    expect(container.textContent).toContain('No OS file needed for the base alone')
    expect(button()?.disabled).toBe(true)
    for (const box of container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) await act(() => box.click())
    expect(button()?.disabled).toBe(false)
    await act(async () => { button()!.click() })
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ identity: baseIdentity(machine, []) }), 'Analog Rytm MKII OS file')
  })
  it('keeps the own-file route for a selection with modules', async () => {
    mocks.images = [entry()]; await render(['anything'])
    expect(button()).toBeUndefined()
    expect(container.textContent).not.toContain('No OS file needed')
  })
  it('offers nothing for an identity the site does not build', async () => {
    mocks.images = [entry('f'.repeat(64))]; await render()
    expect(button()).toBeUndefined()
  })
})
