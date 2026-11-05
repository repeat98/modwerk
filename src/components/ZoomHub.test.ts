// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEffect, fakeEffectList, fakeZoomPedal } from '../dev/zoom-pedal-fake'
import { DEVICES_BY_ID } from '../devices/registry'
import { parseZoomHubRoute, zoomHubHref, type ZoomHubView } from '../devices/zoom-hub-route'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { ZoomHub } from './ZoomHub'

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:backup', revokeObjectURL: () => {} }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
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
  const render = (view: ZoomHubView, link: ZoomLink) => act(() => root.render(createElement(ZoomHub, { device, view, link })))

  it('has its routes, beside the machine’s library', () => {
    expect(zoomHubHref('zoom-ms-70cdr')).toBe('#zoom-ms-70cdr/pedal')
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/backups')).toMatchObject({ device: { id: 'zoom-ms-70cdr' }, view: 'backups' })
    expect(parseZoomHubRoute('zoom-ms-50g/pedal')?.view).toBe('status')
    expect(parseZoomHubRoute('octatrack/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-ms-70cdr/pedal/samples')).toBeUndefined()
  })

  it('connects, then lists what’s on the pedal only when asked', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal({ files, free: 204_800 }).access), 200)
    await render('status', link)
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Not connected/)
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Connect')!); await settle()
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/Connected · firmware 2\.10/)
    expect(container.querySelector('.hub-hero h2')?.textContent).toBe('MS-70CDR')
    await click(button('Read the pedal'))
    for (let i = 0; i < 150 && !open().querySelector('.zoom-files'); i++) await settle()   // reads every effect's version first
    expect(open().textContent).toMatch(/1 effects · 1 captures and cabs · 200 KB free/)
    expect([...open().querySelectorAll('.zoom-files code')].map(c => c.textContent)).toEqual(['LOOP.ZDL', 'NAM1smok.ZDL'])
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
    await click(button('Read the pedal'))
    for (let i = 0; i < 100 && !open().querySelector('.zoom-files'); i++) await settle()
    return Object.assign(fake, { link })
  }
  const until = async (done: () => boolean) => { for (let i = 0; i < 150 && !done(); i++) await settle() }

  it('offers Remove only for added effects, never for Zoom’s own', async () => {
    await setup()
    const rows = [...open().querySelectorAll('.zoom-files li')].map(li => [li.querySelector('code')?.textContent, !!li.querySelector('button')])
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
})
