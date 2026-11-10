// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEffect, fakeEffectList, fakeZoomPedal } from '../dev/zoom-pedal-fake'
import { DEVICES_BY_ID } from '../devices/registry'
import { parseZoomHubRoute, zoomHubHref, type ZoomHubView } from '../devices/zoom-hub-route'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { effectInfo } from '../engine/zoom/zoom-protocol'
import type { ZoomEffect } from '../devices/zoom-effects'
import { InstrumentItem } from './InstrumentItem'
import { ZoomHub, ZoomSidebarStatus } from './ZoomHub'

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:backup', revokeObjectURL: () => {} }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  localStorage.clear()   // the IDs this browser gave out or saw removed (local-ids.ts)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
// Lets the link finish what a test started (a read after an install) before the next test.
const idle = async (link: ZoomLink) => { for (let i = 0; i < 200 && link.getState().status !== 'ready'; i++) await settle() }
const open = () => container.querySelector<HTMLElement>('.hub-view:not([hidden])')!
const button = (text: string) => [...open().querySelectorAll('button')].find(element => element.textContent?.includes(text))!
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))

describe('the Zoom pedal page', () => {
  const device = DEVICES_BY_ID['zoom-ms-70cdr']
  const files = [fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffect('NAM1smok.ZDL', 8, 900, '0.26'), { name: 'FLST_SEQ.ZDT', data: Array(4108).fill(0) }]
  const render = (view: ZoomHubView, link: ZoomLink, onInstall?: () => void) => act(() => root.render(createElement(ZoomHub, { device, view, link, onInstall })))

  it('has its routes, beside the machine’s library', () => {
    expect(zoomHubHref('zoom-ms-70cdr')).toBe('#zoom-ms-70cdr/pedal')
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/backups')).toMatchObject({ device: { id: 'zoom-ms-70cdr' }, view: 'backups' })
    expect(parseZoomHubRoute('zoom-ms-50g/pedal')?.view).toBe('status')
    expect(parseZoomHubRoute('octatrack/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/samples')).toBeUndefined()
  })

  it('connects, then reads what’s on the pedal by itself', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files, free: 204_800 }).access), 200)
    await render('status', link)
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Not connected/)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!); await settle()
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Connected · firmware 2\.10/)
    expect(container.querySelector('.hub-hero h2')?.textContent).toBe('MS-70CDR')
    for (let i = 0; i < 150 && !open().querySelector('.zoom-files'); i++) await settle()   // reads every effect's version first
    expect(open().textContent).toMatch(/1 effect · 1 capture or cab · 200 KB free/)
    expect([...open().querySelectorAll('.zoom-files strong')].map(c => c.textContent)).toEqual(['LOOP.ZDL', 'NAM1smok.ZDL'])
    expect(open().querySelector('.hub-cell-health')?.textContent).toMatch(/Zoom’s firmware 2\.10/)
    expect(open().querySelector('.hub-cell-chart')?.textContent).toMatch(/Zoom’s firmware doesn’t report its load/)
    await idle(link)
  })

  it('reads from any view, and keeps what it read while you are on other pages', async () => {
    const fake = fakeZoomPedal({ files, free: 204_800 }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const reads = vi.spyOn(link, 'listFiles')
    await render('backups', link)
    const free = vi.spyOn(link, 'freeSpace')   // the read's last step
    for (let i = 0; i < 150 && !free.mock.results.length; i++) await settle()
    await free.mock.results[0].value; await settle()
    await act(() => root.unmount()); root = createRoot(container)
    await render('status', link)
    expect(open().querySelector('.zoom-files')).toBeTruthy()
    await settle()
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('shows the load MIDISTOMP reports over USB, as the Octatrack’s Status does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const load = { cpu: 473, audio: 301, audioMax: 352, perform: 12, midi: 4, system: 2, late: 0, lateTotal: 3, dsp: 1050,
        slots: [{ name: 'TapeEcho', cpu: 120, dsp: 450 }, { name: '-', cpu: 0, dsp: 0 }, { name: '-', cpu: 0, dsp: 0 }, { name: '-', cpu: 0, dsp: 0 }, { name: 'NAM1', cpu: 70, dsp: 600 }, { name: '-', cpu: 0, dsp: 0 }] }
      const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files, firmware: 'M201', midistomp: { version: [2, 0, 2], features: 0b111_1111_1111, load } }).access), 200)
      await link.connect()
      await render('status', link)
      await vi.waitFor(() => expect(open().querySelector('.hub-cell-health')?.textContent).toMatch(/MIDISTOMP 2\.0\.2.*Looper services/))
      for (let i = 0; i < 5 && !/47\.3%/.test(open().textContent ?? ''); i++) { await act(() => vi.advanceTimersByTimeAsync(2000)); await settle() }   // the first answer only turns the timing on
      expect([...open().querySelectorAll('.load-meter strong')].map(s => s.textContent)).toEqual(['47.3%', '30.1%', '105/300'])
      expect(open().querySelector('.hub-cell-cpu small')?.textContent).toBe('Late blocks 0 · 3 since switched on')
      expect([...open().querySelectorAll('.hub-cell-history strong')].map(s => s.textContent)).toEqual(['1 · TapeEcho', '2 · Empty', '3 · Empty', '4 · Empty', '5 · NAM1', '6 · Empty', 'Mixer', 'PERFORM', 'MIDI', 'SYSTEM meter', 'Zoom’s OS and screen'])
      expect(open().querySelector('.hub-cell-history li')?.textContent).toMatch(/12\.0%DSP 45\.0/)
      await idle(link)
    } finally { vi.useRealTimers() }
  })

  it('says where MIDISTOMP V2.0.1 shows its load, as it doesn’t send it', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files, firmware: 'M201' }).access), 200)
    await link.connect()
    await render('status', link)
    expect(open().querySelector('.hub-cell-health')?.textContent).toMatch(/MIDISTOMP V2\.0\.1/)
    expect(open().querySelector('.hub-cell-chart')?.textContent).toMatch(/shows its load on the pedal \(at the top of MENU, and in MENU › SYSTEM\)/)
    await idle(link)
  })

  it('backs up all files into a zip to save', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files }).access), 200)
    await link.connect()
    await render('backups', link)
    await click(button('Back up all files'))
    for (let i = 0; i < 100 && !open().querySelector('a[download]'); i++) await settle()   // reading every block takes a moment
    const save = open().querySelector<HTMLAnchorElement>('a[download]')
    expect(save?.download).toMatch(/^zoom-ms-70cdr-backup-.*\.zip$/)
    expect(open().textContent).toMatch(/3 files/)
  })

  it('says when the pedal on the cable is another model', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ deviceId: 0x58, firmware: '3.10' }).access), 200)
    await link.connect()
    await render('setup', link)
    expect(container.querySelector('[role=alert]')?.textContent).toMatch(/This is an MS-50G, not an MS-70CDR/)
    expect(open().textContent).toMatch(/runs firmware 3\.10/)
    expect([...open().querySelectorAll('.zoom-firmware tbody th')].map(th => th.textContent)).toEqual(['Zoom’s firmware (2.10) with effect files', 'MIDISTOMP as the base, by Luca Matturro'])
  })

  it('offers the base on an MS-70CDR without it, and names it once the pedal runs it', async () => {
    const pedal = fakeZoomPedal({ firmware: '1.10' }), link = new ZoomLink(() => Promise.resolve(pedal.access), 200), onInstall = vi.fn()
    await link.connect()
    await render('status', link, onInstall)
    expect(container.querySelector('[role=status]')?.textContent).toBe('Connected in update mode · bootloader 1.10')
    expect(open().textContent).toMatch(/update mode: Install base flashes it/)
    await click([...container.querySelectorAll('.hub-hero button')].find(b => b.textContent === 'Install base')!)
    expect(onInstall).toHaveBeenCalledOnce()
    await act(async () => { pedal.replug('M201') })
    await vi.waitFor(() => expect(container.querySelector('[role=status]')?.textContent).toBe('Connected · MIDISTOMP V2.0.1'))
    await render('setup', link, onInstall)
    expect(open().textContent).toMatch(/Your MS-70CDR runs MIDISTOMP V2\.0\.1/)
    expect(button('Install again')).toBeDefined()
    expect(container.querySelector('.hub-hero button')).toBeNull()
  })

  it('shows the pedal in the sidebar with what it runs, and the action it needs next', async () => {
    const pedal = fakeZoomPedal(), link = new ZoomLink(() => Promise.resolve(pedal.access), 200), onInstall = vi.fn()
    const sidebar = () => act(() => root.render(createElement('div', null, createElement(InstrumentItem, { device, href: '#zoom-ms-70cdr/pedal', zoom: link, current: false }), createElement(ZoomSidebarStatus, { link, onInstall }))))
    await sidebar()
    expect(container.querySelector('.instrument-item small')?.textContent).toBe('Not connected')
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect pedal')!)
    await vi.waitFor(() => expect(container.querySelector('.instrument-item small')?.textContent).toBe('Zoom firmware 2.10: install the base'))
    expect(container.querySelector('.instrument-dot')?.className).toBe('instrument-dot is-stock')
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Install the base')!)
    expect(onInstall).toHaveBeenCalledOnce()
    await act(async () => { pedal.replug('M201') })
    await vi.waitFor(() => expect(container.querySelector('.instrument-item small')?.textContent).toBe('MIDISTOMP V2.0.1'))
    expect(container.querySelector('.instrument-dot')?.className).toBe('instrument-dot is-connected')
    expect(container.querySelector('button')).toBeNull()
  })

  it('needs MIDI: without it, it says which browsers work', async () => {
    await render('status', new ZoomLink(null))
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Chrome or Edge on a computer/)
  })
})

describe('installing and removing on the pedal page', () => {
  const device = DEVICES_BY_ID['zoom-ms-70cdr']
  const setup = async () => {
    vi.stubGlobal('confirm', () => true)
    const files = [fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] })]
    const fake = fakeZoomPedal({ files }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    await act(() => root.render(createElement(ZoomHub, { device, view: 'status', link })))
    for (let i = 0; i < 100 && !open().querySelector('.zoom-files'); i++) await settle()
    return Object.assign(fake, { link })
  }
  const until = async (done: () => boolean) => { for (let i = 0; i < 150 && !done(); i++) await settle() }

  it('offers Remove only for added effects, never for Zoom’s own', async () => {
    await setup()
    const rows = [...open().querySelectorAll('.zoom-files li')].map(li => [li.querySelector('strong')?.textContent, !!li.querySelector('button')])
    expect(rows).toEqual([['DELAY.ZDL', false], ['LOOP.ZDL', true]])
  })
  it('installs a chosen file, then offers the list from before', async () => {
    const fake = await setup(), input = open().querySelector<HTMLInputElement>('input[type=file]')!
    const effect = fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26')
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(effect.data)], 'nam1smok.zdl')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => /installed and read back/.test(open().textContent ?? ''))
    expect(fake.files.find(f => f.name === 'NAM1SMOK.ZDL')?.data).toEqual(effect.data)
    expect(open().querySelector<HTMLAnchorElement>('a[download^="pedal-FLST_SEQ"]')).not.toBeNull()
    await idle(fake.link)
  })
  it('refuses a file outside the added range before writing anything', async () => {
    const fake = await setup(), input = open().querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(fakeEffect('X.ZDL', 7, 99, '1.00').data)], 'X.ZDL')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => !!container.querySelector('.hub-error'))
    expect(container.querySelector('.hub-error')?.textContent).toMatch(/only added effects/)
    expect(fake.sent.some(m => m[4] === 0x60 && m[5] === 0x23)).toBe(false)
    await idle(fake.link)
  })
  it('warns before any write, and refuses an effect ID known to clash', async () => {
    const fake = await setup(), input = open().querySelector<HTMLInputElement>('input[type=file]')!
    expect(open().textContent).toMatch(/Two added effects must never share an effect ID/)
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(fakeEffect('SPOOL.ZDL', 8, 409, '1.00').data)], 'Spool.ZDL')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => !!container.querySelector('.hub-error'))
    expect(container.querySelector('.hub-error')?.textContent).toMatch(/older builds of Spool\.ZDL and TEcho4\.ZDL.*Spool is now 914 and TEcho4 946/)
    expect(fake.sent.some(m => m[4] === 0x60 && m[5] === 0x23)).toBe(false)
    await idle(fake.link)
  })
  it('removes an added effect', async () => {
    const fake = await setup()
    await click([...open().querySelectorAll('.zoom-files button')][0])
    await until(() => /LOOP\.ZDL removed/.test(open().textContent ?? ''))
    expect(fake.files.some(f => f.name === 'LOOP.ZDL')).toBe(false)
    await idle(fake.link)
  })
  it('never gives a removed effect’s ID to a different effect, and installs the same one again at its own ID', async () => {
    const fake = await setup(), pick = async (effect: { name: string; data: number[] }) => {
      const input = open().querySelector<HTMLInputElement>('input[type=file]')!
      Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(effect.data)], effect.name)], configurable: true })
      await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
      await until(() => new RegExp(effect.name.replace('.', '\\.') + ' installed').test(open().textContent ?? ''))
      await idle(fake.link)
    }
    await click([...open().querySelectorAll('.zoom-files button')][0])
    await until(() => /LOOP\.ZDL removed/.test(open().textContent ?? ''))
    await idle(fake.link)
    await pick(fakeEffect('GOOEY.ZDL', 8, 480, '2.00'))
    expect(open().textContent).toMatch(/An effect removed from this pedal had ID 8\/480, so GOOEY\.ZDL is 8\/9\d\d on this pedal/)
    expect(effectInfo(fake.files.find(f => f.name === 'GOOEY.ZDL')!.data)?.fxid).toBeGreaterThanOrEqual(958)
    await pick(fakeEffect('LOOP.ZDL', 8, 480, '0.03'))
    expect(effectInfo(fake.files.find(f => f.name === 'LOOP.ZDL')!.data)?.fxid).toBe(480)
  })
  it('asks before the tab closes while it writes to the pedal', async () => {
    const fake = await setup(), unload = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
    let during: boolean | undefined
    const stop = fake.link.subscribe(() => { if (during === undefined && fake.link.getState().status === 'writing') during = unload() })
    await fake.link.installFile('NAM1SMOK.ZDL', fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26').data)
    stop()
    expect(during).toBe(true)
    expect(unload()).toBe(false)
    await idle(fake.link)
  })
  it('says when the effect list is missing, and writes back one a failed rollback left unwritten', async () => {
    vi.stubGlobal('confirm', () => true)
    const list = fakeEffectList({ 8: ['LOOP.ZDL'] }).data, fake = fakeZoomPedal({ files: [fakeEffect('LOOP.ZDL', 8, 480, '0.03')] }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    await act(() => root.render(createElement(ZoomHub, { device, view: 'status', link })))
    await until(() => !!open().querySelector('.zoom-files'))
    expect(open().querySelector('.hub-error')?.textContent).toMatch(/effect list \(FLST_SEQ\.ZDT\) is missing.*Don’t power-cycle.*Zoom Effect Manager 2\.3\.3 with the pedal in update mode/)
    vi.spyOn(link, 'installFile').mockRejectedValueOnce(Object.assign(new Error('Writing the original effect list back also failed.'), { previousList: list, unrestored: list }))
    const input = open().querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26').data)], 'NAM1SMOK.ZDL')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => !!button('Write the effect list back'))
    await click(button('Write the effect list back'))
    await until(() => /effect list from before is back/.test(open().textContent ?? '') && !open().querySelector('.hub-error'))
    expect(fake.files.find(f => f.name === 'FLST_SEQ.ZDT')?.data).toEqual(list)
    await idle(link)
  })
})

describe('syncing the set to the pedal', () => {
  const device = DEVICES_BY_ID['zoom-ms-70cdr']
  const sha = async (data: number[]) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(data))), b => b.toString(16).padStart(2, '0')).join('')
  const listed = async (id: string, file: string, fxid: number, data: number[]) => ({ id, name: id, version: '0.1.0', machine: device.id, presentation: { summary: '' }, media: [{ kind: 'thumbnail', path: 'thumbnail.svg' }],
    platform: { kind: 'zdl', file, effectId: { gid: 8, fxid }, effectVersion: '0.03', dspCost: 8, binary: { sha256: await sha(data), bytes: data.length, release: { repository: 'https://github.com/x/y', tag: 't', asset: file } }, screen: 'static', pedals: [] } }) as unknown as ZoomEffect

  it('installs the set’s effects, replaces an older version, removes listed ones it dropped and leaves the rest', async () => {
    vi.stubGlobal('confirm', () => true)
    const loop = fakeEffect('LOOP.ZDL', 8, 467, '0.03', 1300), scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), dirt = fakeEffect('DIRT.ZDL', 8, 469, '0.03', 700)
    const effects = [await listed('loop', 'Loop.ZDL', 467, loop.data), await listed('scope', 'Scope.ZDL', 468, scope.data), await listed('dirt', 'Dirt.ZDL', 469, dirt.data)]
    const served: Record<string, number[]> = { 'Loop.ZDL': loop.data, 'Scope.ZDL': scope.data, 'Dirt.ZDL': dirt.data }
    vi.stubGlobal('fetch', async (url: string) => new Response(Uint8Array.from(served[url.split('/').pop()!])))
    const files = [fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('LOOP.ZDL', 8, 467, '0.02', 1300), dirt, fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL', 'DIRT.ZDL'] })]
    const fake = fakeZoomPedal({ files }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['loop', 'scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    expect(open().querySelector('h2')?.textContent).toBe('Live')
    expect(container.querySelector('.hub-set-open strong')?.textContent).toBe('Live')
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    expect(open().querySelector('.hub-sync p')?.textContent).toBe('Installs 2 · Removes 1 · needs 1 KB of 391 KB free')
    expect([...open().querySelectorAll('.module-tile:not(.is-add)')].map(tile => tile.querySelector('strong')?.textContent + ' ' + tile.querySelector('.module-tile-state')?.textContent)).toEqual(['loop Adds', 'scope Adds', 'dirt Leaves'])
    await click(button('Sync to MS-70CDR'))
    for (let i = 0; i < 200 && !/has your set/.test(open().textContent ?? ''); i++) await settle()
    expect(open().textContent).toMatch(/Your MS-70CDR has your set\. Power-cycle the pedal/)
    expect(fake.files.find(f => f.name === 'LOOP.ZDL')?.data).toEqual(loop.data)
    expect(fake.files.find(f => f.name === 'SCOPE.ZDL')?.data).toEqual(scope.data)
    expect(fake.files.some(f => f.name === 'DIRT.ZDL')).toBe(false)
    expect(fake.files.some(f => f.name === 'DELAY.ZDL')).toBe(true)
    for (let i = 0; i < 100 && !/Already on your MS-70CDR/.test(open().textContent ?? ''); i++) await settle()
    expect(button('Sync to MS-70CDR').disabled).toBe(true)
    expect([...open().querySelectorAll('.module-tile:not(.is-add) .module-tile-state')].map(chip => chip.textContent)).toEqual(['On it', 'On it'])
    expect(open().querySelector('a.module-tile-open')?.getAttribute('href')).toBe('#zoom-ms-70cdr/module/loop')
    expect(container.querySelector('.hub-set-open em')?.textContent).toBe('Editing · On your MS-70CDR')
  })
  it('won’t start a sync that doesn’t fit in the pedal’s free space', async () => {
    const scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), fake = fakeZoomPedal({ files: [fakeEffectList({ 8: [] })], free: 5000 }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    const effects = [await listed('scope', 'Scope.ZDL', 468, scope.data)]
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    expect(open().querySelector('.hub-sync p')?.textContent).toMatch(/needs 1 KB of 5 KB free.*Not enough space/)
    expect(button('Sync to MS-70CDR').disabled).toBe(true)
  })
  it('stops at a failed step, says which and what was done, and offers the effect list from before the sync', async () => {
    vi.stubGlobal('confirm', () => true)
    const scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), dirt = fakeEffect('DIRT.ZDL', 8, 469, '0.03', 700)
    const effects = [await listed('scope', 'Scope.ZDL', 468, scope.data), await listed('dirt', 'Dirt.ZDL', 469, dirt.data)]
    vi.stubGlobal('fetch', async () => new Response(Uint8Array.from(scope.data)))
    const fake = fakeZoomPedal({ files: [dirt, fakeEffectList({ 8: ['DIRT.ZDL'] })], failWriteOf: 'SCOPE.ZDL' }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    await click(button('Sync to MS-70CDR'))
    for (let i = 0; i < 200 && !open().querySelector('.hub-error'); i++) await settle()
    expect(open().querySelector('.hub-error')?.textContent).toMatch(/^Installing scope failed \(step 2 of 2; the steps before it are done\)\. The pedal stopped answering while writing SCOPE\.ZDL/)
    expect(fake.files.some(f => f.name === 'DIRT.ZDL')).toBe(false)
    expect(open().querySelector<HTMLAnchorElement>('a[download^="pedal-FLST_SEQ"]')).not.toBeNull()
    await idle(link)
  })
  it('plans from the pedal as it is when Sync is pressed, not as it was read', async () => {
    vi.stubGlobal('confirm', () => true)
    const scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), fake = fakeZoomPedal({ files: [fakeEffectList({ 8: [] })] }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    const effects = [await listed('scope', 'Scope.ZDL', 468, scope.data)]
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    fake.files.splice(0, fake.files.length, scope, fakeEffectList({ 8: ['SCOPE.ZDL'] }))   // put on by another app since
    await click(button('Sync to MS-70CDR'))
    for (let i = 0; i < 100 && !/Already on your MS-70CDR/.test(open().textContent ?? ''); i++) await settle()
    expect(open().textContent).toMatch(/Already on your MS-70CDR/)
    expect(fake.sent.some(m => m[4] === 0x60 && m[5] === 0x20 && m[6] === 0x01)).toBe(false)
    await idle(link)
  })
  it('won’t sync a pedal it may not write to', async () => {
    const scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), fake = fakeZoomPedal({ firmware: '2.00', files: [fakeEffectList({ 8: [] })] }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    const effects = [await listed('scope', 'Scope.ZDL', 468, scope.data)]
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    expect(button('Sync to MS-70CDR').disabled).toBe(true)
    expect(button('Sync to MS-70CDR').title).toMatch(/tested only on the MS-70CDR with Zoom’s firmware 2\.10/)
  })
})
