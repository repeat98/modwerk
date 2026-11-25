// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn(), count: vi.fn(), follow: vi.fn() }))
vi.mock('../engine/elekloader/module-set', () => ({ prepareCardSet: mocked.prepare }))
vi.mock('./OctatrackBackups', () => ({ save: mocked.save }))
vi.mock('../community/usage', () => ({ trackModuleDownloads: mocked.count }))
vi.mock('../community/useDownloadFollows', () => ({ useDownloadFollows: () => ({ followDownloads: mocked.follow, followNotice: '' }) }))
import { encodeCardSet } from '../engine/elekloader/card-set'
import { CardSetDownload } from './UnitPanel'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); HTMLDialogElement.prototype.showModal = function () { this.open = true }; HTMLDialogElement.prototype.close = function () { this.open = false }; container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const button = () => container.querySelector<HTMLButtonElement>('button')!
const set = { name: 'Live set', moduleIds: ['everb', 'euclid'], removedStockFx: [] }

describe('loading a module set from the card', () => {
  it('writes the set as the base’s file, saves it under the name the base reads, then says where it goes and which base it is for', async () => {
    const file = new Uint8Array(512); mocked.prepare.mockResolvedValue({ base: 'd891acb3' + '0'.repeat(56), layout: 'off', modules: ['E-Verb', 'Euclid'], file })
    await act(() => root.render(createElement(CardSetDownload, { set })))
    expect(button().textContent).toBe('Load from the card'); expect(button().className).toContain('button-primary')
    expect(container.textContent).toContain('It needs the Modwerk base on the Octatrack'); expect(container.querySelector('dialog')).toBeNull()
    await act(async () => { button().click() })
    expect(mocked.save).not.toHaveBeenCalled()
    await act(async () => { [...container.querySelectorAll('dialog button')].find(item => item.textContent?.includes('without MODWERK1.SET'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(mocked.prepare).toHaveBeenCalledWith(set); expect(mocked.save).toHaveBeenCalledWith(file, 'MODWERK0.SET'); expect(mocked.count).toHaveBeenCalledWith(['everb', 'euclid'])
    // As a downloaded build did: update notifications and the hardware feedback reminder, for the versions the base packages hold.
    expect(mocked.follow).toHaveBeenCalledWith(['everb', 'euclid'], { machine: 'Octatrack', os: '1.40C', modules: [expect.objectContaining({ id: 'everb', name: 'E-Verb' }), expect.objectContaining({ id: 'euclid' })] })
    const dialog = container.querySelector('dialog.card-set-dialog')!
    expect(dialog.querySelector('h2')?.textContent).toBe('Put MODWERK0.SET on the card')
    expect([...dialog.querySelectorAll('.card-set-plan li')]).toHaveLength(3)
    expect(dialog.textContent).toContain('Top folder, replacing the one there'); expect(dialog.textContent).toContain('Needs the Modwerk base d891acb3 (USB Audio off)')
    // The base file's own name, so a member who installs from the card can match the two (the .bin's name carries the same eight digits).
    expect(dialog.textContent).toContain('Modwerk-octatrack-base-d891acb3.bin installed with OS UPGRADE'); expect(dialog.textContent).toContain('named exactly MODWERK0.SET')
    await act(async () => { [...dialog.querySelectorAll('button')].find(item => item.textContent === 'Done')!.click() })
    expect(container.querySelector('dialog')).toBeNull()
  })
  it('downloads a copy ahead of the selected recovery slot', async () => {
    const base = 'd891acb3' + '0'.repeat(56)
    const source = encodeCardSet(base, [], 15), recovery = encodeCardSet(base, [], 99)
    mocked.prepare.mockResolvedValue({ base, layout: 'off', modules: [], file: source })
    await act(() => root.render(createElement(CardSetDownload, { set })))
    await act(async () => { button().click() })
    const input = container.querySelector<HTMLInputElement>('dialog input[type=file]')!
    Object.defineProperty(input, 'files', { value: [{ name: 'MODWERK1.SET', arrayBuffer: async () => recovery.buffer }] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    const [file, name] = mocked.save.mock.calls[0]
    expect(name).toBe('MODWERK0.SET')
    expect(new DataView(file.buffer).getUint32(8)).toBe(100)
    expect(new DataView(recovery.buffer).getUint32(8)).toBe(99)
  })
  it('says why a set can’t be written, and saves nothing', async () => {
    mocked.prepare.mockRejectedValue(new Error('Tuner can’t be loaded onto the base yet. Take it out of the set.'))
    await act(() => root.render(createElement(CardSetDownload, { set })))
    await act(async () => { button().click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Tuner can’t be loaded onto the base yet'); expect(mocked.save).not.toHaveBeenCalled(); expect(mocked.count).not.toHaveBeenCalled(); expect(mocked.follow).not.toHaveBeenCalled()
  })
  it('warns when the base this browser last downloaded is another one, and leads to the base the file is for', async () => {
    const base = 'd891acb3' + '0'.repeat(56), onInstall = vi.fn()
    localStorage.setItem('modwerk.octatrack.base-download', JSON.stringify({ base: 'aaaaaaaa' + '0'.repeat(56), at: '2026-11-01T10:00:00.000Z' }))
    mocked.prepare.mockResolvedValue({ base, layout: 'off', modules: ['E-Verb'], file: new Uint8Array(512) })
    await act(() => root.render(createElement(CardSetDownload, { set, onInstall })))
    await act(async () => { button().click() })
    const dialog = container.querySelector('dialog.card-set-dialog')!
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('This file is for another base')
    expect(dialog.textContent).toContain('The base you last downloaded here is aaaaaaaa. This file only loads on d891acb3')
    const install = [...dialog.querySelectorAll('button')].find(item => item.textContent === 'Install base d891acb3')!
    expect(install.className).toContain('button-primary')
    await act(async () => { install.click() })
    expect(onInstall).toHaveBeenCalledWith('off'); expect(container.querySelector('dialog')).toBeNull()
  })
  it('warns from the base it last read over USB when that is newer than the last download', async () => {
    const base = 'd891acb3' + '0'.repeat(56)
    localStorage.setItem('modwerk.octatrack.base-download', JSON.stringify({ base, at: '2026-11-01T10:00:00.000Z' }))
    localStorage.setItem('modwerk.octatrack.last-seen', JSON.stringify({ ['bbbbbbbb' + '0'.repeat(56)]: { moduleIds: [], removedStockFx: [], at: '2026-11-10T10:00:00.000Z' } }))
    mocked.prepare.mockResolvedValue({ base, layout: 'off', modules: ['E-Verb'], file: new Uint8Array(512) })
    await act(() => root.render(createElement(CardSetDownload, { set, onInstall: vi.fn() })))
    await act(async () => { button().click() })
    expect(container.querySelector('dialog')?.textContent).toContain('Your Octatrack last ran bbbbbbbb.')
  })
  it('offers the base quietly when the file fits the base this browser knows', async () => {
    const base = 'd891acb3' + '0'.repeat(56)
    localStorage.setItem('modwerk.octatrack.base-download', JSON.stringify({ base, at: '2026-11-01T10:00:00.000Z' }))
    mocked.prepare.mockResolvedValue({ base, layout: 'off', modules: ['E-Verb'], file: new Uint8Array(512) })
    await act(() => root.render(createElement(CardSetDownload, { set, onInstall: vi.fn() })))
    await act(async () => { button().click() })
    const dialog = container.querySelector('dialog.card-set-dialog')!
    expect(dialog.querySelector('[role="alert"]')).toBeNull()
    expect([...dialog.querySelectorAll('button')].find(item => item.textContent === 'Install base d891acb3')!.className).toContain('button-quiet')
    expect([...dialog.querySelectorAll('button')].find(item => item.textContent === 'Done')!.className).toContain('button-primary')
  })
  it('has nothing to write for a set without modules', async () => {
    await act(() => root.render(createElement(CardSetDownload, { set: { ...set, moduleIds: [] } })))
    expect(button().disabled).toBe(true); expect(container.textContent).toContain('Add modules to your set first.')
  })
})
