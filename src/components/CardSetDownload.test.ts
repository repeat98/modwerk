// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn() }))
vi.mock('../engine/elekloader/module-set', () => ({ prepareCardSet: mocked.prepare }))
vi.mock('./OctatrackBackups', () => ({ save: mocked.save }))
import { CardSetDownload } from './UnitPanel'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const button = () => container.querySelector<HTMLButtonElement>('button')!
const set = { name: 'Live set', moduleIds: ['everb', 'euclid'], removedStockFx: [] }

describe('loading a module set from the card', () => {
  it('writes the set as the base’s file, saves it under the name the base reads, and says which base it is for', async () => {
    const file = new Uint8Array(512); mocked.prepare.mockResolvedValue({ base: 'd891acb3' + '0'.repeat(56), layout: 'off', modules: ['E-Verb', 'Euclid'], file })
    await act(() => root.render(createElement(CardSetDownload, { set })))
    expect(button().textContent).toBe('Download MODWERK0.SET'); expect(container.textContent).toContain('It needs the Modwerk base on the Octatrack')
    expect([...container.querySelectorAll('.card-set-steps li')]).toHaveLength(3)
    await act(async () => { button().click() })
    expect(mocked.prepare).toHaveBeenCalledWith(set); expect(mocked.save).toHaveBeenCalledWith(file, 'MODWERK0.SET')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Written for the Modwerk base d891acb3 (USB Audio off)')
  })
  it('says why a set can’t be written, and saves nothing', async () => {
    mocked.prepare.mockRejectedValue(new Error('Tuner can’t be loaded over USB yet. Download the .bin for the card instead.'))
    await act(() => root.render(createElement(CardSetDownload, { set })))
    await act(async () => { button().click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Tuner can’t be loaded over USB yet'); expect(mocked.save).not.toHaveBeenCalled()
  })
  it('has nothing to write for a set without modules', async () => {
    await act(() => root.render(createElement(CardSetDownload, { set: { ...set, moduleIds: [] } })))
    expect(button().disabled).toBe(true); expect(container.textContent).toContain('Add modules to your set first.')
  })
})
