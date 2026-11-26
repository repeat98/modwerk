// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCurrentPatch, fakeEffect, fakeEffectList, fakeZoomPedal, withFakeEffectControls } from '../dev/zoom-pedal-fake'
import { DEVICES_BY_ID } from '../devices/registry'
import { parseZoomHubRoute, zoomHubHref, type ZoomHubView } from '../devices/zoom-hub-route'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { effectInfo, parseCurrentPatch } from '../engine/zoom/zoom-protocol'
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
    expect(zoomHubHref('zoom-ms-70cdr', 'editor')).toBe('#zoom-ms-70cdr/pedal/editor')
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/editor')?.view).toBe('editor')
    expect(parseZoomHubRoute('zoom-ms-50g/pedal/editor')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-ms-50g/pedal')?.view).toBe('status')
    expect(parseZoomHubRoute('octatrack/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/samples')).toBeUndefined()
  })

  it('shows stock and Modwerk controls in patch order and applies only staged changes', async () => {
    const patch = fakeCurrentPatch('Afterglow', [
      { index: 0, gid: 7, fxid: 16, values: [250, 35] },
      { index: 1, gid: 8, fxid: 993, values: [78, 52, 24, 0, 1, 144] },
      { index: 2, gid: 8, fxid: 414 },
      { index: 5, gid: 8, fxid: 993, enabled: false, values: [25, 50, 70, 0, 0, 98] },
    ])
    const fake = fakeZoomPedal({ patch, firmware: 'D004', files: [
      withFakeEffectControls(fakeEffect('DELAY.ZDL', 7, 16, '1.00'), 'Tape Echo', [['Time', 2000], ['Feedback', 100]]),
      withFakeEffectControls(fakeEffect('LOOP.ZDL', 8, 993, '0.03'), 'Loop', [['Loop', 100], ['Dry', 100], ['Fade', 100], ['Undo', 1], ['Long', 1], ['Tempo', 250]]),
      fakeEffect('SCOPE.ZDL', 8, 414, '0.03'), fakeEffect('SPECTRUM.ZDL', 8, 468, '0.02'),
      fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL', 'SPECTRUM.ZDL'] }),
    ] })
    const link = new ZoomLink(() => Promise.resolve(fake.access), 100)
    const confirm = vi.fn(() => true)   // the printed model, asked before the first write
    vi.stubGlobal('confirm', confirm)
    await render('editor', link)
    expect(open().textContent).toContain('Connect your MS-70CDR')
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!)
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    const cards = [...open().querySelectorAll('.zoom-patch-card')]
    expect(open().querySelector('h2')?.textContent).toBe('Afterglow')
    expect(cards.map(card => card.getAttribute('aria-label'))).toEqual(['Tape Echo, slot 1', 'Loop, slot 2', 'Unknown effect, slot 3', 'Loop, slot 6'])
    expect(cards[0].textContent).toContain('Stock effect')
    expect(cards[0].querySelector<HTMLInputElement>('input[aria-label="Time"]')).toMatchObject({ type: 'range', max: '2000', value: '250' })
    expect(cards[1].querySelector<HTMLSelectElement>('select')?.selectedOptions[0].textContent).toBe('On')
    expect(cards[2].querySelector('input, select')).toBeNull()
    expect(cards[3].textContent).toContain('Bypassed')
    expect(cards[3].querySelector<HTMLSelectElement>('select')?.selectedOptions[0].textContent).toBe('Off')
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[aria-current=page]')?.textContent).toBe('Editor')
    const patchCommands = () => fake.sent.filter(m => m[1] === 0x52 && m[4] !== 0x60).map(m => m[4])
    expect(patchCommands()).toEqual([0x29])

    const long = cards[3].querySelector('select')!
    await act(() => { long.value = '1'; long.dispatchEvent(new Event('change', { bubbles: true })) })
    await click(cards[0].querySelector('button')!)
    expect(patchCommands()).toEqual([0x29])
    await click(button('Apply to pedal'))
    for (let i = 0; i < 100 && !open().textContent?.includes('Patch changes applied'); i++) await settle()
    expect(open().textContent).toContain('Patch changes applied and read back.')
    expect(patchCommands()).toEqual([0x29, 0x29, 0x50, 0x28, 0x29])
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]).toEqual([expect.stringContaining('does it say MS-70CDR?')])
    expect(await link.currentPatch()).toMatchObject({
      slots: [{ enabled: false }, { values: [78, 52, 24, 0, 1, 144, 0, 0, 0] }, { fxid: 414 }, { enabled: false, values: [25, 50, 70, 0, 1, 98, 0, 0, 0] }],
    })
    await idle(link)

    patch.splice(0, patch.length, ...fakeCurrentPatch('Stock only', [{ index: 0, gid: 7, fxid: 16 }]))
    await click(button('Refresh patch'))
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    expect(open().querySelector('h2')?.textContent).toBe('Stock only')
    expect([...open().querySelectorAll('.zoom-patch-card')].map(card => card.getAttribute('aria-label'))).toEqual(['Tape Echo, slot 1'])
    await idle(link)
  })

  it('moves live knobs at once, stages the rest, adds an effect, saves into another patch and lists all fifty', async () => {
    const fifty = Array.from({ length: 50 }, (_, at) => fakeCurrentPatch(at ? 'Patch ' + (at + 1) : 'Afterglow', [{ index: 0, gid: 7, fxid: 16, values: [250, 35] }, { index: 5, gid: 7, fxid: 16, values: [10, 20] }]))
    const fake = fakeZoomPedal({ patches: fifty, files: [
      withFakeEffectControls(fakeEffect('DELAY.ZDL', 7, 16, '1.00'), 'Tape Echo', [['Time', 2000], ['Feedback', 100]]),
      withFakeEffectControls(fakeEffect('LOOP.ZDL', 8, 993, '0.03'), 'Loop', [['Loop', 100], ['Dry', 100]]),
      fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] }),
    ] })
    const link = new ZoomLink(() => Promise.resolve(fake.access), 100)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    await render('editor', link)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!)
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    const turn = (input: HTMLInputElement, value: number) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const card = (label: string) => open().querySelector<HTMLElement>('[aria-label="' + label + '"]')!
    const choose = (select: HTMLSelectElement, value: string) => act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })

    // Slot 1 takes live knob messages: the pedal hears it now, nothing waits for Apply. Slot 6 waits.
    await turn(card('Tape Echo, slot 1').querySelector<HTMLInputElement>('input[aria-label="Time"]')!, 300)
    await vi.waitFor(() => expect(fake.knobs).toEqual([[0, 2, 44, 2, 0xf7]]))
    expect(button('Apply to pedal')).toBeUndefined()
    await turn(card('Tape Echo, slot 6').querySelector<HTMLInputElement>('input[aria-label="Time"]')!, 400)
    expect(fake.knobs).toHaveLength(1)
    expect(button('Apply to pedal')).toBeTruthy()

    // An effect into the empty slot 2, from the pedal's effect list, then Apply sends it with the slot 6 knob.
    await click([...open().querySelectorAll('.zoom-patch-slot-empty button')][0])
    for (let i = 0; i < 100 && !open().querySelector('optgroup'); i++) await settle()
    await choose(open().querySelector<HTMLSelectElement>('select[aria-label="Effect for slot 2"]')!, 'LOOP.ZDL')
    for (let i = 0; i < 100 && !card('Loop, slot 2'); i++) await settle()
    expect(card('Loop, slot 2').textContent).toContain('not applied')
    await click(button('Apply to pedal'))
    for (let i = 0; i < 100 && !open().textContent?.includes('Patch changes applied'); i++) await settle()
    expect(parseCurrentPatch(fake.patch!)?.slots.map(s => [s.index, s.fxid, s.values[0]])).toEqual([[0, 16, 300], [1, 993, 0], [5, 16, 400]])
    expect(fake.patches![0]).toEqual(fifty[0])

    // Save into patch 5 asks first, since it overwrites another patch.
    await choose(open().querySelector<HTMLSelectElement>('.zoom-patch-save select')!, '4')
    await click(button('Save'))
    for (let i = 0; i < 150 && !open().textContent?.includes('Saved as patch 5.'); i++) await settle()
    expect(confirm).toHaveBeenCalledWith('Save over patch 5?')
    expect(fake.patches![4]).toEqual(fake.patch!)
    expect(open().querySelector('.zoom-patch-number')?.textContent).toBe('Patch 5')

    // Read all lists the fifty, and the pedal comes back to patch 5.
    await click(button('Read all 50'))
    for (let i = 0; i < 400 && !open().querySelector('.zoom-patch-list li:nth-child(50) button:not(:disabled)'); i++) await settle()
    const list = [...open().querySelectorAll('.zoom-patch-list button')]
    expect(list.map(b => b.textContent)).toEqual(Array.from({ length: 50 }, (_, at) => (at + 1) + (at === 0 || at === 4 ? 'Afterglow' : 'Patch ' + (at + 1))))
    expect(list[4].getAttribute('aria-current')).toBe('true')
    expect(fake.program).toBe(4)
    await idle(link)
  }, 20_000)

  it('keeps changes not saved through Read all when the pedal never said which patch it was on', async () => {
    const fifty = Array.from({ length: 50 }, (_, at) => fakeCurrentPatch('Patch ' + (at + 1), [{ index: 0, gid: 7, fxid: 16, values: [at] }]))
    const fake = fakeZoomPedal({ patches: fifty, program: 3, files: [withFakeEffectControls(fakeEffect('DELAY.ZDL', 7, 16, '1.00'), 'Tape Echo', [['Time', 2000]]), fakeEffectList({ 7: ['DELAY.ZDL'] })] })
    fake.patch!.splice(0, 146, ...fakeCurrentPatch('Edited', [{ index: 0, gid: 7, fxid: 16, values: [999] }]))
    const link = new ZoomLink(() => Promise.resolve(fake.access), 100)
    vi.stubGlobal('confirm', vi.fn(() => true))
    await render('editor', link)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!)
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    await click(button('Read all 50'))
    for (let i = 0; i < 400 && !open().textContent?.includes('kept but not saved'); i++) await settle()
    expect(open().textContent).toContain('its changes match none of the 50, so they’re kept but not saved')
    expect(open().textContent).not.toContain('was chosen on the pedal')
    expect(open().querySelector('h2')?.textContent).toBe('Edited')
    expect(open().querySelector('.zoom-patch-number')).toBeNull()
    expect(open().querySelector<HTMLSelectElement>('.zoom-patch-save select')?.value).toBe('')
    expect(button('Save').disabled).toBe(true)
    expect(parseCurrentPatch(fake.patch!)?.name).toBe('Edited')
    await idle(link)
  }, 20_000)

  it('writes no patch change before the model printed on the pedal is confirmed', async () => {
    const fifty = Array.from({ length: 50 }, (_, at) => fakeCurrentPatch('Patch ' + (at + 1), [{ index: 0, gid: 7, fxid: 16, values: [at] }, { index: 5, gid: 7, fxid: 16 }]))
    const fake = fakeZoomPedal({ patches: fifty, files: [withFakeEffectControls(fakeEffect('DELAY.ZDL', 7, 16, '1.00'), 'Tape Echo', [['Time', 2000]]), fakeEffectList({ 7: ['DELAY.ZDL'] })] })
    const link = new ZoomLink(() => Promise.resolve(fake.access), 100)
    const confirm = vi.fn<(text: string) => boolean>(() => false)
    vi.stubGlobal('confirm', confirm)
    await render('editor', link)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!)
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    const turn = (input: HTMLInputElement, value: number) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const [first, sixth] = [...open().querySelectorAll<HTMLInputElement>('input[aria-label="Time"]')]
    await turn(first, 300)
    await turn(sixth, 400)
    await click(button('Apply to pedal'))
    await click(button('Save'))
    await click(button('Read all 50'))
    await settle()
    expect(confirm.mock.calls.every(([text]) => text.includes('does it say MS-70CDR?'))).toBe(true)
    expect(fake.sent.some(m => m[0] === 0xc0 || (m[1] === 0x52 && [0x28, 0x31, 0x32, 0x50].includes(m[4])))).toBe(false)
    await idle(link)
  })

  it('follows a patch chosen on the pedal', async () => {
    const fifty = Array.from({ length: 50 }, (_, at) => fakeCurrentPatch('Patch ' + (at + 1), [{ index: 0, gid: 7, fxid: 16, values: [at] }]))
    const fake = fakeZoomPedal({ patches: fifty, files: [withFakeEffectControls(fakeEffect('DELAY.ZDL', 7, 16, '1.00'), 'Tape Echo', [['Time', 2000]]), fakeEffectList({ 7: ['DELAY.ZDL'] })] })
    const link = new ZoomLink(() => Promise.resolve(fake.access), 100)
    await render('editor', link)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!)
    for (let i = 0; i < 100 && !open().querySelector('.zoom-patch-card'); i++) await settle()
    expect(open().querySelector('h2')?.textContent).toBe('Patch 1')
    await act(() => fake.turn(8))
    for (let i = 0; i < 100 && open().querySelector('h2')?.textContent !== 'Patch 9'; i++) await settle()
    expect(open().querySelector('h2')?.textContent).toBe('Patch 9')
    expect(open().textContent).toContain('Patch 9 was chosen on the pedal')
    await idle(link)
  })

  it('connects, then reads what’s on the pedal by itself', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files, free: 204_800 }).access), 200)
    await render('status', link)
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Not connected/)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!); await settle()
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Connected · firmware 2\.10/)
    expect(container.querySelector('.hub-hero h1')?.textContent).toBe('MS-70CDR')
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
  it('asks for the model printed on the pedal before the first write of a connection, and Cancel writes nothing (#2076)', async () => {
    const fake = await setup(), asked: string[] = []
    let answer = false
    vi.stubGlobal('confirm', (text: string) => { asked.push(text); return /front of your pedal/.test(text) ? answer : true })
    await click([...open().querySelectorAll('.zoom-files button')][0])
    await until(() => asked.length > 0)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(/does it say MS-70CDR\? A pedal running MIDISTOMP answers as an MS-70CDR/)
    expect(fake.files.some(f => f.name === 'LOOP.ZDL'), 'Cancel removed nothing').toBe(true)
    answer = true
    await click([...open().querySelectorAll('.zoom-files button')][0])
    await until(() => !fake.files.some(f => f.name === 'LOOP.ZDL'))
    expect(asked.filter(text => /front of your pedal/.test(text))).toHaveLength(2)
    const input = open().querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from(fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26').data)], 'nam1smok.zdl')], configurable: true })
    await act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => /installed and read back/.test(open().textContent ?? ''))
    expect(asked.filter(text => /front of your pedal/.test(text)), 'asked once a connection, not before every write').toHaveLength(2)
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
  it.each([false, true])('offers rollback recovery only on its original connection (replace pedal: %s)', async replace => {
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
    if (replace) {
      const originalConnection = link.getState().connection!
      const other = fakeZoomPedal({ files: [fakeEffectList({ 8: ['OTHER.ZDL'] })] })
      const before = other.files[0].data.slice()
      fake.input.state = fake.output.state = 'disconnected'
      Object.assign(fake.access, { inputs: other.access.inputs, outputs: other.access.outputs })
      await act(() => fake.access.onstatechange?.({}))
      await until(() => link.getState().status === 'ready')
      expect(button('Write the effect list back')).toBeUndefined()
      expect(open().querySelector('a[download]')).toBeTruthy()
      await idle(link)
      await expect(link.restoreList(list, originalConnection)).rejects.toThrow(/connection changed/)
      expect(other.files[0].data).toEqual(before)
      return
    }
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

  it.each([['2.10', false], ['D004', true]] as const)('syncs a set on %s with a missing or unlisted file (unlisted: %s)', async (firmware, orphan) => {
    vi.stubGlobal('confirm', () => true)
    const loop = fakeEffect('LOOP.ZDL', 8, 467, '0.03', 1300), scope = fakeEffect('SCOPE.ZDL', 8, 468, '0.03', 900), dirt = fakeEffect('DIRT.ZDL', 8, 469, '0.03', 700)
    const effects = [await listed('loop', 'Loop.ZDL', 467, loop.data), await listed('scope', 'Scope.ZDL', 468, scope.data), await listed('dirt', 'Dirt.ZDL', 469, dirt.data)]
    const served: Record<string, number[]> = { 'Loop.ZDL': loop.data, 'Scope.ZDL': scope.data, 'Dirt.ZDL': dirt.data }
    vi.stubGlobal('fetch', async (url: string) => new Response(Uint8Array.from(served[url.split('/').pop()!])))
    const files = [fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('LOOP.ZDL', 8, 467, '0.02', 1300), dirt, fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL', 'DIRT.ZDL'] })]
    if (orphan) files.push(scope)
    const fake = fakeZoomPedal({ firmware, files }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const live = { id: 'live', name: 'Live', device: device.id, moduleIds: ['loop', 'scope'], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    await act(() => root.render(createElement(ZoomHub, { device, view: 'set', link, sets: [live], selectedId: 'live', onSelect: () => {}, onNew: () => {}, onSetAction: () => {}, listed: effects })))
    expect(open().querySelector('h2')?.textContent).toBe('Live')
    expect(container.querySelector('.hub-set-open strong')?.textContent).toBe('Live')
    for (let i = 0; i < 100 && !/Installs/.test(open().textContent ?? ''); i++) await settle()
    expect(open().querySelector('.hub-sync p')?.textContent).toBe(orphan ? 'Installs 2 · Removes 1 · 391 KB free' : 'Installs 2 · Removes 1 · needs 1 KB of 391 KB free')
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
    expect(open().querySelector('.hub-sync p')?.textContent).toMatch(/Effect file changes require the MS-70CDR with Zoom 2\.10/)
  })
})

describe('the MS-50G’s pedal page (read only)', () => {
  const device = DEVICES_BY_ID['zoom-ms-50g']
  const files = [fakeEffect('DELAY.ZDL', 8, 8, '1.00'), fakeEffectList({ 8: ['DELAY.ZDL'] })]
  const render = (view: ZoomHubView, link: ZoomLink) => act(() => root.render(createElement(ZoomHub, { device, view, link })))

  it('names the pedal and its firmware, backs up its files, and offers no base', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ deviceId: 0x58, firmware: '3.10', files }).access), 200)
    await link.connect()
    await render('backups', link)
    expect(container.querySelector('[role=alert]')?.textContent ?? '').not.toMatch(/not an/)
    expect(container.textContent).not.toMatch(/Install base/)
    await click(button('Back up all files'))
    for (let i = 0; i < 100 && !open().querySelector('a[download]'); i++) await settle()
    expect(open().querySelector<HTMLAnchorElement>('a[download]')?.download).toMatch(/^zoom-ms-50g-backup-.*\.zip$/)
    expect(open().textContent).toMatch(/2 files/)
    await idle(link)
  })

  it('describes the MS-50G’s own firmware, and no base for it yet', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ deviceId: 0x58, firmware: '3.10', files }).access), 200)
    await link.connect()
    await render('setup', link)
    const rows = [...open().querySelectorAll('.zoom-firmware tbody tr')].map(tr => tr.textContent)
    expect(rows[0]).toMatch(/^Zoom’s firmware \(3\.10\) with effect files/)
    expect(rows[1]).toMatch(/Not on the MS-50G yet/)
    expect(rows[1]).not.toMatch(/own updater|2\.10 updater/)
    await render('status', link)
    expect(open().textContent).toMatch(/Zoom’s firmware doesn’t report its load\./)
    expect(open().textContent).not.toMatch(/The base will/)
    await idle(link)
  })

  it('shows an MS-50G in update mode as update mode', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ deviceId: 0x58, firmware: '1.10' }).access), 200)
    await link.connect()
    await render('status', link)
    expect(container.querySelector('[role=status]')?.textContent).toBe('Connected in update mode · bootloader 1.10')
  })
})
