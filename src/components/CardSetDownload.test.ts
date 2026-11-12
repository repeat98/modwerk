// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn(), count: vi.fn(), follow: vi.fn() }))
vi.mock('../engine/elekloader/module-set', () => ({ prepareCardSet: mocked.prepare }))
vi.mock('./OctatrackBackups', () => ({ save: mocked.save }))
vi.mock('../community/usage', () => ({ trackModuleDownloads: mocked.count }))
vi.mock('../community/useDownloadFollows', () => ({ useDownloadFollows: () => ({ followDownloads: mocked.follow, followNotice: '' }) }))
import { CardSetDownload } from './UnitPanel'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); HTMLDialogElement.prototype.showModal = function () { this.open = true }; HTMLDialogElement.prototype.close = function () { this.open = false }; container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const button = () => container.querySelector<HTMLButtonElement>('button')!
const set = { name: 'Live set', moduleIds: ['everb', 'euclid'], removedStockFx: [] }

describe('loading a module set from the card', () => {
  it('writes the set as the base’s file, saves it under the name the base reads, then says where it goes and which base it is for', async () => {
    const file = new Uint8Array(512); mocked.prepare.mockResolvedValue({ base: 'd891acb3' + '0'.repeat(56), layout: 'off', modules: ['E-Verb', 'Euclid'], file })
    await act(() => root.render(createElement(CardSetDownload, { set })))
    expect(button().textContent).toBe('Load from the card'); expect(button().className).toContain('button-primary')
    expect(container.textContent).toContain('It needs the Modwerk base on the Octatrack'); expect(container.querySelector('dialog')).toBeNull()
    await act(async () => { button().click() })
    expect(mocked.prepare).toHaveBeenCalledWith(set); expect(mocked.save).toHaveBeenCalledWith(file, 'MODWERK0.SET'); expect(mocked.count).toHaveBeenCalledWith(['everb', 'euclid'])
    // As a downloaded build did: update notifications and the hardware feedback reminder, for the versions the base packages hold.
    expect(mocked.follow).toHaveBeenCalledWith(['everb', 'euclid'], { machine: 'Octatrack', os: '1.40C', modules: [expect.objectContaining({ id: 'everb', name: 'E-Verb' }), expect.objectContaining({ id: 'euclid' })] })
    const dialog = container.querySelector('dialog.card-set-dialog')!
    expect(dialog.querySelector('h2')?.textContent).toBe('Put MODWERK0.SET on the card')
    expect([...dialog.querySelectorAll('.card-set-plan li')]).toHaveLength(3)
    expect(dialog.textContent).toContain('Top folder, replacing the one there'); expect(dialog.textContent).toContain('Needs the Modwerk base d891acb3 (USB Audio off)')
    await act(async () => { [...dialog.querySelectorAll('button')].find(item => item.textContent === 'Done')!.click() })
    expect(container.querySelector('dialog')).toBeNull()
  })
  it('says why a set can’t be written, and saves nothing', async () => {
    mocked.prepare.mockRejectedValue(new Error('Tuner can’t be loaded onto the base yet. Take it out of the set.'))
    await act(() => root.render(createElement(CardSetDownload, { set })))
    await act(async () => { button().click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Tuner can’t be loaded onto the base yet'); expect(mocked.save).not.toHaveBeenCalled(); expect(mocked.count).not.toHaveBeenCalled(); expect(mocked.follow).not.toHaveBeenCalled()
  })
  it('has nothing to write for a set without modules', async () => {
    await act(() => root.render(createElement(CardSetDownload, { set: { ...set, moduleIds: [] } })))
    expect(button().disabled).toBe(true); expect(container.textContent).toContain('Add modules to your set first.')
  })
})
