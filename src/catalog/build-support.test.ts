import { describe, expect, it } from 'vitest'
import { MODULE_DOCUMENTS_BY_ID } from './documents'
import { getModuleSource, resolveSelection } from './modules'
import { createSelection, parseSelection } from '../config/selection'

const imported = ['analog-bassdrum', 'usb-audio-out-tracks-main-cue', 'quantizer']

describe('reviewed imports with verified loader-free composition', () => {

  it('saves exact imported module versions without claiming firmware validation', () => {
    const selection = { ...createSelection(imported, null), name: 'New modules' }
    expect(selection.validation).toBe('pending')
    expect(parseSelection(JSON.stringify(selection)).moduleIds).toEqual(imported)
    for (const id of imported) {
      expect(selection.modules.find(module => module.id === id)?.version).toBe(id === 'usb-audio-out-tracks-main-cue' ? '0.2.0-experimental' : id === 'analog-bassdrum' ? '0.1.7-experimental' : id === 'quantizer' ? '0.1.4-experimental' : '0.1.2-experimental')
    }
  })

  it('links each import to its pinned upstream source and retains historical qualification limits', () => {
    for (const module of resolveSelection(imported)) {
      expect(getModuleSource(module)).toBe(
        'https://github.com/sambanks/octabam/tree/' + (module.id === 'usb-audio-out-tracks-main-cue' ? '6f9e5bc9db0ae9fa99fa2f2a0f4de1fdb8e9a136' : '363861e31ee963c478fab2b190a0fabe1d7ce37b') + '/modules/' + module.id,
      )
      expect(MODULE_DOCUMENTS_BY_ID[module.id].tests.hardwareStatus).toBe(['usb-audio-out-tracks-main-cue', 'analog-bassdrum'].includes(module.id) ? 'untested' : module.id === 'quantizer' ? 'reported' : 'historical')
    }
    expect(MODULE_DOCUMENTS_BY_ID['usb-audio-out-tracks-main-cue'].compatibility.limitations.join(' ').toLowerCase()).toContain('output only')
    expect(MODULE_DOCUMENTS_BY_ID['analog-bassdrum'].compatibility.conflicts).toContain('synth')
  })
})
