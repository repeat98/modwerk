// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEffect, fakeEffectList, fakeZoomPedal } from '../dev/zoom-pedal-fake'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { ZoomEffectInstall } from './ZoomEffectDetail'
import type { ZoomEffect } from './zoom-effects'

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!
const until = (check: () => boolean) => vi.waitFor(() => { if (!check()) throw new Error('not yet') }, { timeout: 3000, interval: 20 })
const hex = async (data: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice())), b => b.toString(16).padStart(2, '0')).join('')

async function effectWith(data: Uint8Array): Promise<ZoomEffect> {
  return { id: 'loop', name: 'Loop', version: '0.1.0', machine: 'zoom-ms-70cdr', platform: { kind: 'zdl', file: 'Loop.ZDL', effectId: { gid: 8, fxid: 467 }, effectVersion: '0.03', dspCost: 8, binary: { sha256: await hex(data), bytes: data.length, release: { repository: 'https://github.com/repeat98/ZoomMultistompZDL', tag: 'loop-0.03', asset: 'Loop.ZDL' } }, screen: 'live', pedals: [] } } as unknown as ZoomEffect
}

describe('installing a library effect on the pedal', () => {
  it('connects, checks the file against its pin, writes it and adds it to the effect list', async () => {
    const file = Uint8Array.from(fakeEffect('LOOP.ZDL', 8, 467, '0.03').data), effect = await effectWith(file)
    const fetched = vi.fn(async () => new Response(file.slice()))
    vi.stubGlobal('fetch', fetched)
    vi.stubGlobal('confirm', () => true)
    const pedal = fakeZoomPedal({ files: [fakeEffectList({ 8: [] })] }), link = new ZoomLink(() => Promise.resolve(pedal.access), 200)
    await act(() => root.render(createElement(ZoomEffectInstall, { effect, link })))
    await act(async () => { button('Connect your MS-70CDR').click() })
    await until(() => link.getState().status === 'ready')
    await act(async () => { button('Install on your MS-70CDR').click() })
    await until(() => /installed and read back identical/.test(container.textContent ?? ''))
    expect(fetched).toHaveBeenCalledWith(expect.stringMatching(/zoom-effects\/loop\/0\.1\.0\/Loop\.ZDL$/))
    expect(pedal.files.find(f => f.name === 'LOOP.ZDL')?.data).toEqual(Array.from(file))
    expect(new TextDecoder().decode(Uint8Array.from(pedal.files.find(f => f.name === 'FLST_SEQ.ZDT')!.data))).toContain('LOOP.ZDL')
  })

  it('refuses a file that isn’t the pinned one, and writes nothing', async () => {
    const file = Uint8Array.from(fakeEffect('LOOP.ZDL', 8, 467, '0.03').data), effect = await effectWith(file)
    vi.stubGlobal('fetch', async () => new Response(file.slice(0, 100)))
    vi.stubGlobal('confirm', () => true)
    const pedal = fakeZoomPedal({ files: [fakeEffectList({ 8: [] })] }), link = new ZoomLink(() => Promise.resolve(pedal.access), 200)
    await link.connect()
    await act(() => root.render(createElement(ZoomEffectInstall, { effect, link })))
    await act(async () => { button('Install on your MS-70CDR').click() })
    await until(() => /not the file this page lists/.test(container.textContent ?? ''))
    expect(pedal.files.some(f => f.name === 'LOOP.ZDL')).toBe(false)
  })
})
