// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddBlock } from '../catalog/add-blocks'
import { DETAILS } from '../catalog/details'
import { MODULES } from '../catalog/modules'
import { ModuleCard } from './ModuleCard'

const tapehead = MODULES.find(module => module.id === 'tapehead')!
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

function card(props: Partial<Parameters<typeof ModuleCard>[0]> = {}) {
  const calls = { toggle: vi.fn(), swap: vi.fn() }
  const render = (extra: Partial<Parameters<typeof ModuleCard>[0]> = {}) => act(() => root.render(createElement(ModuleCard, {
    module: tapehead, selected: false, baseline: null, compared: false, canCompare: true, onToggle: calls.toggle, onCompare: () => {}, onSwap: calls.swap, ...props, ...extra,
  })))
  return { calls, render }
}
// A note as a selection check writes it: what the module clashes with, why, and what to take out to add it.
const conflict: AddBlock = { kind: 'conflict', withIds: ['analog-bassdrum'], reason: 'Conflicts with Analog BD', detail: 'Analog BD cannot run alongside TapeHead.', swapRemoveIds: ['analog-bassdrum'], key: 'tapehead:analog-bassdrum' }
const addButton = () => container.querySelector<HTMLButtonElement>('.add-button')!
const prompt = () => container.querySelector('.add-block-prompt')
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))!

describe('a conflicting add in the library', () => {
  it('shows the conflict before any click and keeps the card readable', async () => {
    await card({ block: conflict }).render()
    expect(container.querySelector('.add-block-chip.is-conflict')?.textContent).toBe('Conflicts with Analog BD')
    expect(container.querySelector('.module-card-heading a')?.textContent).toBe('TapeHead')
    expect(addButton().classList.contains('is-conflict')).toBe(true)
    expect(addButton().disabled).toBe(false)
    expect(addButton().getAttribute('aria-expanded')).toBe('false')
    expect(addButton().getAttribute('aria-label')).toContain('Conflicts with Analog BD')
    expect(prompt()).toBeNull()
  })
  it('adds no row to the card: the note replaces the type line and the prompt floats over the card', async () => {
    const { render } = card({ block: conflict })
    await render()
    const bottom = container.querySelector('.card-bottom')!
    expect(bottom.firstElementChild?.classList.contains('add-block-chip')).toBe(true)
    expect(bottom.textContent).not.toContain(DETAILS.tapehead.family)
    await click(addButton())
    const article = container.querySelector('article')!
    expect(prompt()?.parentElement).toBe(article)
    expect(container.querySelector('.module-card-body')?.contains(prompt())).toBe(false)
  })
  it('puts focus in the prompt and makes the covered card inert while it is open', async () => {
    const { render } = card({ block: conflict })
    await render()
    expect(container.querySelector('.module-card-body')?.hasAttribute('inert')).toBe(false)
    await click(addButton())
    expect(prompt()?.contains(document.activeElement)).toBe(true)
    expect(container.querySelector('.module-card-body')?.hasAttribute('inert')).toBe(true)
    expect(container.querySelector('.module-cover')?.hasAttribute('inert')).toBe(true)
    await click(buttonNamed('Cancel'))
    expect(container.querySelector('.module-card-body')?.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(addButton())
  })
  it('does not add when the button is pressed; it opens a prompt with the swap', async () => {
    const { calls, render } = card({ block: conflict })
    await render()
    await click(addButton())
    expect(calls.toggle).not.toHaveBeenCalled()
    expect(addButton().getAttribute('aria-expanded')).toBe('true')
    expect(addButton().getAttribute('aria-controls')).toBe(prompt()?.id)
    expect(prompt()?.textContent).toContain('cannot run alongside TapeHead')
    expect(buttonNamed('Remove Analog BD and add TapeHead')).toBeTruthy()
  })
  it('swaps by handing the modules to remove to the library', async () => {
    const { calls, render } = card({ block: conflict })
    await render()
    await click(addButton())
    await click(buttonNamed('Remove Analog BD and add TapeHead'))
    expect(calls.swap).toHaveBeenCalledWith(['analog-bassdrum'])
    expect(calls.toggle).not.toHaveBeenCalled()
    expect(prompt()).toBeNull()
  })
  it('still lets the user add anyway, or back out with Escape and keep focus on the button', async () => {
    const { calls, render } = card({ block: conflict })
    await render()
    await click(addButton())
    await click(buttonNamed('Add anyway'))
    expect(calls.toggle).toHaveBeenCalledTimes(1)
    expect(calls.swap).not.toHaveBeenCalled()
    await click(addButton())
    await act(() => { prompt()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(prompt()).toBeNull()
    expect(document.activeElement).toBe(addButton())
  })
  it('offers only the explanation when the rules name no swap', async () => {
    await card({ block: { kind: 'conflict', withIds: ['miniverb', 'tapeecho', 'repitch', 'quantizer'], reason: 'Conflicts with Mini Verb, Tape Echo and 2 more', detail: 'These five together leave no menu space.', key: 'euclid:miniverb+tapeecho+repitch+quantizer' } }).render()
    expect(addButton().textContent).toBe('Review')
    await click(addButton())
    expect(buttonNamed('Add anyway')).toBeTruthy()
    expect([...container.querySelectorAll('.add-block-actions button')].some(button => button.textContent?.startsWith('Remove'))).toBe(false)
  })
  it('closes the prompt when the selection it described changes', async () => {
    const { render } = card({ block: conflict })
    await render()
    await click(addButton())
    await render({ block: { ...conflict, withIds: ['synth'], key: 'vector:synth' } })
    expect(prompt()).toBeNull()
  })
  it('leaves a plain add button for stock FX2 and nothing for a module that fits or is added', async () => {
    const { render } = card({ block: { kind: 'stock-fx2', withIds: [], reason: 'Needs stock FX2 off', detail: 'These modules need space used by the original FX2 effects.', key: 'stock-fx2-space' } })
    await render()
    expect(addButton().classList.contains('is-conflict')).toBe(false)
    expect(addButton().getAttribute('aria-label')).toBe('Add TapeHead to configuration')
    expect(container.querySelector('.add-block-chip')?.textContent).toBe('Needs stock FX2 off')
    await render({ block: undefined })
    expect(container.querySelector('.add-block-chip')).toBeNull()
    expect(container.querySelector('.card-bottom')?.textContent).toContain(DETAILS.tapehead.family)
    await render({ block: conflict, selected: true })
    expect(container.querySelector('.add-block-chip')).toBeNull()
    expect(addButton().getAttribute('aria-label')).toBe('Remove TapeHead from configuration')
  })
})
