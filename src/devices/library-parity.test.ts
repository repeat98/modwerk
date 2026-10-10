import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AVAILABLE_MODULES } from '../catalog/availability'
import { selectionConflicts } from '../catalog/selection-conflicts'
import { LibraryTools } from '../components/LibraryTools'
import { ModuleComparison } from '../components/ModuleComparison'
import { DEFAULT_MODULE_SORT } from '../community/module-statistics'
import { DEVICES_BY_ID } from './registry'
import { DIGI_MODS } from './digi-mods'
import { MachineLibrary } from './MachinePages'

const noop = () => {}
// The all-machines library is the machine library without a device; a Digi library is the same view with that machine's selection.
const AllMachinesLibrary = MachineLibrary
type DigiDevice = NonNullable<Parameters<typeof MachineLibrary>[0]['device']> & { id: 'digitakt' | 'digitone' }
type DigiProps = { device: DigiDevice; selectedIds: string[]; onToggle: (id: string) => void } & Omit<Parameters<typeof MachineLibrary>[0], 'device' | 'octatrackModules' | 'octatrackSelected' | 'onToggleOctatrack' | 'digiSelected' | 'onToggleDigi' | 'octatrackConflicts' | 'viewedModuleVersions' | 'moduleBaseline'>
function DigiLibrary({ device, selectedIds, onToggle, ...rest }: DigiProps) {
  return createElement(MachineLibrary, { ...rest, device, octatrackModules: [], octatrackSelected: [], onToggleOctatrack: noop, digiSelected: { digitakt: device.id === 'digitakt' ? selectedIds : [], digitone: device.id === 'digitone' ? selectedIds : [] }, onToggleDigi: (_: string, id: string) => onToggle(id), octatrackConflicts: [], viewedModuleVersions: {}, moduleBaseline: null })
}
// Likes and downloads show the number beside an icon; the word is there for screen readers only.
const count = (value: string, word: string) => value + '<span class="sr-only"> ' + word + '</span>'
const props = {
  query: '', octatrackModules: AVAILABLE_MODULES, octatrackSelected: ['miniverb'],
  onToggleOctatrack: noop, digiSelected: { digitakt: [], digitone: [] }, onToggleDigi: noop,
  family: 'all', onFamilyChange: noop, sort: 'collection', onSortChange: noop,
  statistics: [{module_id: 'miniverb', average: 4.5, count: 2, likes: 7, downloads: 12, downloadsStarted: null}],
  octatrackConflicts: [], comparison: ['miniverb'], onCompare: noop, onOpenComparison: noop,
  viewedModuleVersions: {}, moduleBaseline: AVAILABLE_MODULES.map(module=>module.id),
}

describe('machine switching layout', () => {
  it.each(['octatrack', 'digitakt', 'digitone', 'syntakt'])('keeps the search tools and build action in the %s library without the local-build banner', id => {
    const html = renderToStaticMarkup(createElement(MachineLibrary, {...props, device: DEVICES_BY_ID[id]}))
    expect(html.indexOf('class="discovery-tools"')).toBeLessThan(html.indexOf('class="library-subheading"'))
    expect(html).toContain('<h1>Module library</h1>')
    expect(html).toContain('Collection order')
    expect(html).toContain('Build firmware</a>')
    expect(html).not.toContain('device-preview-note')
    expect(html).not.toContain('firmware locally with your original OS file')
    if (id === 'syntakt') {
      expect(html).toContain('aria-disabled="true"')
      expect(html).not.toContain('href="#syntakt/configuration"')
      expect(html).toContain('Be the first to mod the')
    } else expect(html).toContain('href="' + (id === 'octatrack' ? '#configuration' : '#' + id + '/configuration') + '"')
  })
})

describe('All machines library parity', () => {
  it('keeps the Octatrack build, sort, rating, popularity and comparison controls', () => {
    const html = renderToStaticMarkup(createElement(AllMachinesLibrary, props))
    const tools = renderToStaticMarkup(createElement(LibraryTools, {
      family: 'all', families: [], onFamilyChange: noop, sort: 'collection', onSortChange: noop,
      comparisonCount: 1, onCompare: noop,
    }))
    for (const value of ['updated', 'collection', 'recent', 'name', 'author', 'rated', 'liked', 'downloaded']) {
      const option = `<option value="${value}"`
      expect(html).toContain(option)
      expect(tools).toContain(option)
    }
    expect(html).toContain('href="#configuration"')
    expect(html).toContain('Build firmware')
    expect(html).toContain('<h1>All mods</h1>')
    expect(html.slice(html.indexOf('class="discovery-tools"'), html.indexOf('id="machine-octatrack"'))).toContain('Build firmware')
    expect(html.slice(html.indexOf('id="machine-octatrack"'),html.indexOf('id="machine-digitakt"'))).not.toContain('Build firmware')
    expect(html).toContain('aria-label="Build firmware for Octatrack"')
    expect(html).toContain('4.5 (2)')
    expect(html).toContain(count('7', 'likes'))
    expect(html).toContain(count('12', 'downloads'))
    expect(html).toContain('Remove Mini Verb from configuration')
    expect(html).toContain('type="checkbox" checked=""')
  })

  it('shows saved Octatrack and Digitakt collisions even when filters hide their modules', () => {
    const html = renderToStaticMarkup(createElement(AllMachinesLibrary, {...props,
      query: 'no matching modules', octatrackModules: [],
      octatrackConflicts: selectionConflicts(['midi-scenes', 'analog-bassdrum']),
      digiSelected: {digitakt: ['digislicer', 'digisophie'], digitone: []},
    }))
    expect(html).toContain('Octatrack: your selection needs a change')
    expect(html).toContain('Digitakt: your selection needs a change')
    expect(html).toContain('href="#digitakt/configuration"')
    expect(html).not.toContain('Digitone: your selection needs a change')
    expect(html).toContain('No modules found')
    expect(html).toContain('aria-label="Build firmware for Octatrack"')
  })

  it('keeps unavailable counts distinct from zero and offers a build link for each machine', () => {
    const html = renderToStaticMarkup(createElement(AllMachinesLibrary, {...props, statistics: null}))
    expect(html).toContain(count('—', 'likes'))
    expect(html).toContain(count('—', 'downloads'))
    expect(html).not.toContain(count('0', 'downloads'))
    expect(html).toContain('Popularity counts are currently unavailable.')
    expect(html.match(/aria-label="Build firmware for/g)).toHaveLength(3)
    expect(html).toContain('href="#digitakt/configuration"')
    expect(html).toContain('href="#digitone/configuration"')
  })

  it('applies type and alphabetical sorting to the Digi groups', () => {
    const html = renderToStaticMarkup(createElement(AllMachinesLibrary, {...props,
      octatrackModules: [], family: 'Sampling', sort: 'name',
    }))
    expect(html).toContain('DIGISLICER')
    expect(html).toContain('NEIGHBOR')
    expect(html.indexOf('View DIGISLICER')).toBeLessThan(html.indexOf('View NEIGHBOR'))
    expect(html).not.toContain('View SOPHIE')
    expect(html).not.toContain('View digihealth')
  })
})


describe('Digi library parity', () => {
  it('selects Recently updated and sorts releases consistently in both libraries without popularity data', () => {
    const releases = new Map(DIGI_MODS.map(mod => [mod, mod.updatedAt]))
    try {
      for (const mod of DIGI_MODS.filter(mod => mod.device === 'digitakt')) {
        if (mod.id === 'digisophie') mod.updatedAt = '2026-10-08T00:00:00Z'
        if (mod.id === 'digislicer') mod.updatedAt = '2026-10-07T00:00:00Z'
        if (mod.id === 'digihealth') mod.updatedAt = '2026-10-01T00:00:00Z'
      }
      const all = renderToStaticMarkup(createElement(AllMachinesLibrary, {...props, sort: DEFAULT_MODULE_SORT, statistics: null}))
      const digitakt = renderToStaticMarkup(createElement(DigiLibrary, {...props, device: {...DEVICES_BY_ID.digitakt, id: 'digitakt'}, selectedIds: [], onToggle: noop, sort: DEFAULT_MODULE_SORT, statistics: null}))
      for (const html of [all, digitakt]) {
        expect(html).toContain('<option value="updated" selected="">Recently updated</option>')
        expect(html.indexOf('View SOPHIE')).toBeLessThan(html.indexOf('View DIGISLICER'))
        expect(html.indexOf('View DIGISLICER')).toBeLessThan(html.indexOf('View digihealth'))
      }
    } finally {
      for (const [mod, date] of releases) mod.updatedAt = date
    }
  })

  const digiProps = { device: {...DEVICES_BY_ID.digitakt, id: 'digitakt' as const}, category: undefined, query: '', selectedIds: [], onToggle: noop, family: 'all', onFamilyChange: noop, sort: 'collection', onSortChange: noop, statistics: props.statistics, comparison: [], onCompare: noop, onOpenComparison: noop }

  it.each(['liked', 'downloaded', 'rated'])('shows and sorts %s statistics in both libraries without sharing counts across machines', sort => {
    const statistics = [
      {module_id: 'digitakt-digisophie', average: 4.8, count: 5, likes: 19, downloads: 42, downloadsStarted: '2026-10-01T00:00:00Z'},
      {module_id: 'digitakt-digihealth', average: 3.2, count: 2, likes: 8, downloads: 11, downloadsStarted: '2026-10-01T00:00:00Z'},
      {module_id: 'digitone-digihealth', average: 2.5, count: 4, likes: 3, downloads: 7, downloadsStarted: '2026-10-01T00:00:00Z'},
    ]
    const all = renderToStaticMarkup(createElement(AllMachinesLibrary, {...props, sort, statistics}))
    const digitakt = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, sort, statistics}))
    for (const html of [all, digitakt]) {
      expect(html.indexOf('View SOPHIE')).toBeLessThan(html.indexOf('View digihealth'))
      for (const value of ['4.8 (5)', count('19', 'likes'), count('42', 'downloads'), '3.2 (2)', count('8', 'likes'), count('11', 'downloads')]) expect(html).toContain(value)
      expect(html).not.toContain('counts are not available yet')
    }
    const digitone = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, device: {...DEVICES_BY_ID.digitone, id: 'digitone'}, statistics}))
    for (const html of [all.slice(all.indexOf('id="machine-digitone"')), digitone]) {
      for (const value of ['2.5 (4)', count('3', 'likes'), count('7', 'downloads')]) expect(html).toContain(value)
      expect(html).not.toContain(count('8', 'likes'))
      expect(html).not.toContain(count('11', 'downloads'))
    }
  })

  it('displays a loaded zero total differently from an unavailable service', () => {
    const statistics = DIGI_MODS.map(mod => ({module_id: mod.device + '-' + mod.id, average: 0, count: 0, likes: 0, downloads: 0, downloadsStarted: null}))
    for (const device of ['digitakt', 'digitone'] as const) {
      const machine = {...DEVICES_BY_ID[device], id: device}
      const loaded = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, device: machine, statistics}))
      const unavailable = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, device: machine, statistics: null}))
      expect(loaded).toContain(count('0', 'likes'))
      expect(loaded).toContain(count('0', 'downloads'))
      expect(loaded).not.toContain('is-rating')
      expect(loaded).not.toContain(count('—', 'downloads'))
      expect(unavailable).toContain(count('—', 'likes'))
      expect(unavailable).toContain(count('—', 'downloads'))
      expect(unavailable).not.toContain(count('0', 'downloads'))
    }
  })

  it('uses the OT toolbar and sends each machine to its own builder', () => {
    for (const device of ['digitakt', 'digitone'] as const) {
      const html = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, device: {...DEVICES_BY_ID[device], id: device}}))
      const toolbar = renderToStaticMarkup(createElement(LibraryTools, { ...digiProps, families: Array.from(new Set(DIGI_MODS.filter(mod=>mod.device===device).map(mod=>mod.category))), comparisonCount: 0, buildHref: '#'+device+'/configuration', buildLabel: 'Build firmware for '+DEVICES_BY_ID[device].name }))
      expect(html).toContain(toolbar)
      expect(html).toContain('Compare<span class="sr-only">')
      expect(html).not.toContain('href="#configuration"')
    }
  })

  it('filters type together with search and sorts the Digi library by name', () => {
    const html = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, family: 'Sampling', sort: 'name'}))
    expect(html.indexOf('View DIGISLICER')).toBeLessThan(html.indexOf('View NEIGHBOR'))
    expect(html).not.toContain('View SOPHIE')
    expect(html).not.toContain('View digihealth')
    const search = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, family: 'Sampling', query: 'neighbor'}))
    expect(search).toContain('View NEIGHBOR')
    expect(search).not.toContain('View DIGISLICER')
    const switched = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, family: 'Octatrack-only type'}))
    expect(switched).toContain('View SOPHIE')
  })

  it('finds DigiSophie by its developer in both libraries', () => {
    for (const query of ['Sjoerd', 'soejrd']) {
      const digi = renderToStaticMarkup(createElement(DigiLibrary, { ...digiProps, query }))
      const all = renderToStaticMarkup(createElement(AllMachinesLibrary, { ...props, query, octatrackModules: [] }))
      for (const html of [digi, all]) {
        expect(html).toContain('View SOPHIE')
        expect(html).toContain('>Sjoerd (Soejrd)</a>')
        expect(html).not.toContain('View DIGISLICER')
        expect(html).not.toContain('>Matt Estela</a>')
      }
    }
  })

  it('limits comparison to three cards while permitting removal and scopes matching module IDs by machine', () => {
    const html = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, comparison: ['digitakt-digihealth','digitone-digihealth','miniverb']}))
    expect(html).toContain('Compare (3)')
    expect(html).toContain('type="checkbox" checked=""')
    expect(html).toContain('type="checkbox" disabled=""')
    const other = renderToStaticMarkup(createElement(DigiLibrary, {...digiProps, comparison: ['digitone-digihealth']}))
    expect(other).not.toContain('type="checkbox" checked=""')
    const dialog = renderToStaticMarkup(createElement(ModuleComparison, {ids:['digitakt-digihealth','digitone-digihealth'], selected: [], digiSelected:{digitakt:['digihealth'],digitone:[]}, onToggle:noop,onToggleDigi:noop,onClose:noop}))
    expect(dialog).toContain('href="/digitakt/module/digihealth/"')
    expect(dialog).toContain('href="/digitone/module/digihealth/"')
    expect(dialog).toContain('aria-pressed="true"')
    expect(dialog).toContain('aria-pressed="false"')
    expect(dialog).toContain('Not measured')
  })
})
