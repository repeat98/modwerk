// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OctatrackSamples } from './OctatrackSamples'
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
const createURL = vi.fn(() => 'blob:local-preview'), revokeURL = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  createURL.mockClear(); revokeURL.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Samples WIP must stay local') }))
  localStorage.clear()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createURL; static revokeObjectURL = revokeURL })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('keeps selection local, previews only after explicit selection and revokes audio URLs on clear', async () => {
  await act(async () => root.render(createElement(OctatrackSamples)))
  expect(container.textContent).toContain('Work in progress')
  expect(container.textContent).toContain('No USB connection is needed')
  const input = container.querySelector('input')!
  Object.defineProperty(input, 'files', { value: [new File(['audio'], 'kick.wav', { type: 'audio/wav' }), new File(['text'], 'notes.txt')], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(container.textContent).toContain('1 sample')
  expect(container.textContent).not.toContain('notes.txt')
  expect(createURL).not.toHaveBeenCalled()
  const sample = container.querySelector<HTMLButtonElement>('.samples-tree button')!
  await act(async () => sample.click())
  expect(createURL).toHaveBeenCalledTimes(1)
  expect(container.querySelector('audio')?.autoplay).toBe(false)
  await act(async () => container.querySelector('audio')!.dispatchEvent(new Event('error')))
  expect(container.textContent).toContain('can’t preview this format')
  const clear = [...container.querySelectorAll('button')].find(button => button.textContent === 'Clear selection')!
  await act(async () => clear.click())
  expect(revokeURL).toHaveBeenCalledWith('blob:local-preview')
  expect(container.querySelector('audio')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
})
it('shows dropped audio locally with folder labels and does not start playback', async () => {
  await act(async () => root.render(createElement(OctatrackSamples)))
  const file = new File(['audio'], 'hat.wav', { type: 'audio/wav' })
  Object.defineProperty(file, 'webkitRelativePath', { value: 'Drums/Hats/hat.wav' })
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } })
  await act(async () => container.querySelector('.samples-drop')!.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
  expect([...container.querySelectorAll('summary')].map(item => item.textContent)).toEqual(['Drums', 'Hats'])
  expect(container.querySelector('input[webkitdirectory]')).not.toBeNull()
  expect(createURL).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
