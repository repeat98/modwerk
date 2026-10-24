import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AVAILABLE_MODULES } from '../catalog/availability'
import { MachineLibrary } from '../devices/MachinePages'
import { DEVICES_BY_ID } from '../devices/registry'
import { LibraryDock } from './LibraryDock'
import { LibraryResultsBar } from './LibraryResultsBar'

const noop = () => {}
const bar = { summary: '3 modules · Octatrack', sort: 'updated', onSortChange: noop, family: 'all', onFamilyChange: noop, families: [{ value: 'Scenes', count: 1 }], allCount: 3 }

describe('phone library results bar', () => {
  it('names the view, shows short sort and type labels and marks only changed choices', () => {
    const html = renderToStaticMarkup(createElement(LibraryResultsBar, bar))
    expect(html).toContain('3 modules · Octatrack')
    expect(html).toContain('aria-label="Sort: Recently updated"')
    expect(html).toContain('<span>Updated</span>')
    expect(html).toContain('aria-label="Type: all types"')
    expect(html).not.toContain('is-set')
    const changed = renderToStaticMarkup(createElement(LibraryResultsBar, { ...bar, sort: 'downloaded', family: 'Scenes' }))
    expect(changed).toContain('<span>Downloads</span>')
    expect(changed).toContain('<span>Scenes</span>')
    expect(changed.match(/is-set/g)).toHaveLength(2)
  })

  it('leaves out sort and type on a machine without modules', () => {
    const html = renderToStaticMarkup(createElement(LibraryResultsBar, { ...bar, summary: 'No modules yet · Syntakt', disabled: true }))
    expect(html).toContain('No modules yet · Syntakt')
    expect(html).not.toContain('<button')
  })

  it('replaces the desktop filter row on phones', () => {
    const props = {
      query: '', octatrackModules: AVAILABLE_MODULES, octatrackSelected: [], onToggleOctatrack: noop, digiSelected: { digitakt: [], 'digitakt-ii': [], digitone: [], 'analog-rytm-mkii': [] }, onToggleDigi: noop,
      family: 'all', onFamilyChange: noop, sort: 'updated', onSortChange: noop, statistics: null, octatrackConflicts: [], comparison: [], onCompare: noop, onOpenComparison: noop,
      viewedModuleVersions: {}, moduleBaseline: null, device: DEVICES_BY_ID.octatrack,
    }
    expect(renderToStaticMarkup(createElement(MachineLibrary, props))).toContain('class="discovery-tools"')
    const phone = renderToStaticMarkup(createElement(MachineLibrary, { ...props, phone: true }))
    expect(phone).not.toContain('discovery-tools')
    expect(phone).toMatch(/<h1[^>]*>Module library<\/h1>/)
  })
})

describe('phone library dock', () => {
  const build = { count: 2, detail: 'Live set', href: '#configuration' }
  it('offers the build only when nothing is being compared', () => {
    const html = renderToStaticMarkup(createElement(LibraryDock, { compared: [], onClearComparison: noop, onCompare: noop, build }))
    expect(html).toContain('2 modules added')
    expect(html).toContain('href="#configuration"')
    expect(renderToStaticMarkup(createElement(LibraryDock, { compared: [], onClearComparison: noop, onCompare: noop, build: null }))).toBe('')
  })

  it('shows the comparison first and needs two modules to compare', () => {
    const one = renderToStaticMarkup(createElement(LibraryDock, { compared: ['FM Synth'], onClearComparison: noop, onCompare: noop, build }))
    expect(one).toContain('1 of 3 to compare')
    expect(one).not.toContain('Build firmware')
    expect(one).toMatch(/<button[^>]*disabled=""[^>]*>Compare<\/button>/)
    const two = renderToStaticMarkup(createElement(LibraryDock, { compared: ['FM Synth', 'USB Audio'], onClearComparison: noop, onCompare: noop, build }))
    expect(two).toContain('FM Synth, USB Audio')
    expect(two).not.toMatch(/disabled=""[^>]*>Compare</)
  })
})
