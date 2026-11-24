// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEffectList, fakeKnobbedEffect, fakePatch, fakeZoomPedal } from '../dev/zoom-pedal-fake'
import { ZoomLink } from '../engine/zoom/zoom-link'
import { decodePatch, encodePatch, patchEffectId } from '../engine/zoom/zoom-patch'
import { ZoomPatches } from './ZoomPatches'

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  localStorage.clear()
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const until = async (done: () => boolean) => { for (let i = 0; i < 300 && !done(); i++) await settle() }
const button = (text: string) => [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text))!
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const slot = (n: number) => container.querySelectorAll<HTMLElement>('.zoom-slot')[n]

describe('the Zoom pedal page’s Patches', () => {
  const hall = fakeKnobbedEffect('HALL.ZDL', 9, 40, 'Hall', [['Decay', 29, 9], ['Tone', 10, 5]])
  const loop = fakeKnobbedEffect('LOOP.ZDL', 8, 480, 'Loop', [['Time', 100, 50]])
  const pedal = () => {
    const patches = Array.from({ length: 50 }, (_, i) => fakePatch('Patch ' + (i + 1)))
    const p = decodePatch(patches[2])
    p.slots[0] = { on: true, effect: patchEffectId(9, 40), knobs: [20, 3, 0, 0, 0, 0, 0, 0, 0] }
    p.slots[3] = { on: false, effect: patchEffectId(8, 480), knobs: [70, 0, 0, 0, 0, 0, 0, 0, 0] }
    patches[2] = encodePatch(p, patches[2], 0x61)
    return fakeZoomPedal({ patches, program: 2, files: [fakeEffectList({ 8: ['LOOP.ZDL'], 9: ['HALL.ZDL'] }), hall, loop] })
  }
  const opened = async () => {
    const fake = pedal(), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    const identity = link.getState().identity
    await act(() => root.render(createElement(ZoomPatches, { link, identity, active: true })))
    await until(() => !!container.querySelector('.zoom-knob'))
    return { fake, link }
  }

  it('opens the patch the pedal plays, with its effects’ names and knobs read from the pedal’s files', async () => {
    await opened()
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Patch name"]')!.value).toBe('Patch 3')
    expect(slot(0).querySelector('select')!.selectedOptions[0].textContent).toBe('Hall')
    expect([...slot(0).querySelectorAll('.zoom-knob span')].map(e => e.textContent)).toEqual(['Decay', 'Tone'])
    expect(slot(0).querySelector('output')!.textContent).toBe('20')
    expect(slot(3).querySelector('.zoom-slot-toggle')!.textContent).toBe('Off')
    expect(slot(1).querySelector('select')!.value).toBe('0')
    expect(JSON.stringify(localStorage)).toContain('HALL.ZDL:3000')   // a second visit reads no knob tables
  }, 20_000)
  it('turns a knob in slot 1 live and saves the patch into its program', async () => {
    const { fake, link } = await opened()
    const range = slot(0).querySelector<HTMLInputElement>('input[type="range"]')!
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '25')
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(fake.knobs.at(-1)).toEqual([0, 2, 25, 0, 0xf7])
    expect(container.textContent).toContain('Not saved')
    // No program change has said which patch this is: Save waits for one to be chosen.
    expect(button('Save').disabled).toBe(true)
    const into = container.querySelector<HTMLSelectElement>('select[aria-label="Save into patch"]')!
    await act(() => { into.value = '2'; into.dispatchEvent(new Event('change', { bubbles: true })) })
    await click(button('Save'))
    await until(() => link.getState().status === 'ready' && !container.textContent!.includes('Not saved'))
    expect(decodePatch(fake.patches![2]).slots[0].knobs[0]).toBe(25)
    expect(container.textContent).toContain('Saved as patch 3')
  }, 20_000)
  it('keeps changes not saved through Read all when the pedal never said its patch number, and asks where to save them', async () => {
    const { fake, link } = await opened()
    const edited = decodePatch(fake.buffer!)
    edited.name = 'Edited'
    await link.writePatch(encodePatch(edited, fake.buffer!, 0x61))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await click(button('Read all'))
    const name = () => container.querySelector<HTMLInputElement>('input[aria-label="Patch name"]')!.value
    await until(() => link.getState().status === 'ready' && name() === 'Edited')
    expect(container.textContent).toContain('Choose where to save them')
    expect(decodePatch(fake.buffer!).name).toBe('Edited')
    expect(container.textContent).toContain('Not saved')
    expect(button('Save').disabled).toBe(true)
  }, 30_000)
  it('switches a slot on with one patch write', async () => {
    const { fake, link } = await opened()
    await click(slot(3).querySelector('.zoom-slot-toggle')!)
    await until(() => link.getState().status === 'ready' && slot(3).querySelector('.zoom-slot-toggle')!.textContent === 'On')
    expect(decodePatch(fake.buffer!).slots[3].on).toBe(true)
  }, 20_000)
  it('says which pedals it can’t edit yet', async () => {
    const fake = fakeZoomPedal({ deviceId: 0x58, firmware: '3.10' }), link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    await act(() => root.render(createElement(ZoomPatches, { link, identity: link.getState().identity, active: true })))
    expect(container.textContent).toContain('mapped only for the MS-70CDR')
  })
})
