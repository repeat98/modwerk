import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigiBuildPanel } from './DigiBuildPanel'
import type { useDigiFirmware } from '../hooks/useDigiFirmware'

const mocks = vi.hoisted(() => ({track: vi.fn(), moduleIds: ['digihealth'], phase: 'built'}))
vi.mock('../community/usage', () => ({trackFirmwareDownload: mocks.track}))
vi.mock('../hooks/useDigiBuild', () => ({useDigiBuild: () => ({
  state: {phase: mocks.phase, key: 'completed-build', moduleIds: mocks.moduleIds,
    device: {default_version: '2.0a', version_len: 4},
    result: {version: '2.0a', files: [{name: 'preview.syx', data: new ArrayBuffer(4)}], bytes: 4, seconds: 1, mods: []}},
  check: vi.fn(), build: vi.fn(), cancel: vi.fn(),
})}))
afterEach(() => {vi.unstubAllGlobals();mocks.track.mockClear();mocks.moduleIds = ['digihealth'];mocks.phase = 'built'})

function downloadAction(machine: 'digitakt' | 'digitone') {
  let action: (() => void) | undefined
  function inspect(node: ReactNode) {
    if (Array.isArray(node)) {node.forEach(inspect);return}
    if (!isValidElement<{children?: ReactNode; onClick?: () => void}>(node)) return
    if (node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Download .syx')) action = node.props.onClick
    inspect(node.props.children)
  }
  function Capture() {
    const tree = DigiBuildPanel({device: {id: machine, name: machine}, firmware: {state: 'empty'} as ReturnType<typeof useDigiFirmware>,
      moduleIds: ['digislicer'], onExport: vi.fn(), exported: false, canExport: false, results: null})
    inspect(tree)
    return tree
  }
  renderToStaticMarkup(createElement(Capture))
  return action
}

describe('Digi firmware download statistics', () => {
  it.each(['digitakt', 'digitone'] as const)('counts %s modules from the completed build only after a download request', machine => {
    const click = vi.fn()
    vi.stubGlobal('document', {createElement: () => ({click, remove: vi.fn()}), body: {append: vi.fn()}})
    vi.stubGlobal('window', {setTimeout: (callback: () => void) => callback()})
    const download = downloadAction(machine)
    expect(download).toBeTypeOf('function')
    expect(mocks.track).not.toHaveBeenCalled()
    download!()
    expect(click).toHaveBeenCalledOnce()
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith([machine + '-digihealth'], machine)
  })

  it('does not report module downloads while the build is still running', () => {
    mocks.phase = 'building'
    expect(downloadAction('digitakt')).toBeUndefined()
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('counts a core-only firmware request without attributing it to a module', () => {
    mocks.moduleIds = []
    vi.stubGlobal('document', {createElement: () => ({click: vi.fn(), remove: vi.fn()}), body: {append: vi.fn()}})
    vi.stubGlobal('window', {setTimeout: (callback: () => void) => callback()})
    downloadAction('digitone')!()
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith([], 'digitone')
  })
})
