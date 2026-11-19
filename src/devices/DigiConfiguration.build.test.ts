// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CommunityContext, emptySession } from '../community/context'
import { newConfiguration, type Configuration } from '../config/workspace'
import { DigiConfiguration } from './MachinePages'
import { DEVICES_BY_ID } from './registry'

vi.mock('../hooks/useDigiFirmware', () => {
  const file = new File(['test'], 'stock.syx')
  return { useDigiFirmware: () => ({
    state: 'ready', file, firmware: { name: file.name, bytes: file.size, release: '1.54', sha256: 'a'.repeat(64) },
  }) }
})
vi.mock('../community/member-access', async original => ({
  ...await original<typeof import('../community/member-access')>(), requireBuildAccount: async () => {},
}))
vi.mock('../engine/elekloader/machine-build', async original => ({
  ...await original<typeof import('../engine/elekloader/machine-build')>(),
  createMachineBuilder: () => ({ dispose() {}, version: async () => ({ ok: true, name: 'test.syx' }) }),
  prepareBuild: async () => ({ ok: true, enabled: ['digihealth'], check: { ok: true }, device: { default_version: '2.0a', version_len: 4 } }),
  buildWithLock: async () => ({ ok: true, version: '2.0a', sha256: 'b'.repeat(64), bytes: 4, seconds: 1, mods: ['digihealth'], files: [{ name: 'test.syx', data: new ArrayBuffer(4) }] }),
}))

it('keeps a build through a rename and clears it when another set has the same modules', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const container = document.createElement('div'), root = createRoot(container)
  document.body.append(container)
  const device = { ...DEVICES_BY_ID.digitakt, id: 'digitakt' as const }
  const first = newConfiguration('Live', ['digihealth'], false, undefined, 'digitakt')
  const second = newConfiguration('Studio', ['digihealth'], false, undefined, 'digitakt')
  const noop = () => {}
  const session = { ...emptySession, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } }
  const render = (configuration: Configuration) => act(() => root.render(createElement(CommunityContext.Provider, {
    value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} },
  }, createElement(DigiConfiguration, {
    device, configuration, configurations: [first, second], onSelect: noop, onDialog: noop,
    onToggle: noop, onImport: noop, onStorageLock: noop, onReport: noop,
  }))))
  const button = (label: string) => [...container.querySelectorAll('button')].find(item => item.textContent === label)
  const risk = () => container.querySelector<HTMLInputElement>('.risk-acceptance input')!
  try {
    await render(first)
    await act(async () => button('Check selection')!.click())
    await act(() => risk().click())
    await act(async () => button('Build firmware')!.click())
    expect(button('Download .syx')).toBeDefined()
    await render({ ...first, name: 'Live renamed' })
    expect(button('Download .syx')).toBeDefined()
    await render(second)
    expect(button('Download .syx')).toBeUndefined()
    expect(button('Check selection')?.disabled).toBe(false)
    expect(risk().checked).toBe(false)
    expect(container.textContent).toContain('SHA-256 verified')
  } finally {
    await act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
