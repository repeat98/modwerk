import { describe, expect, it } from 'vitest'
import { moduleMediaDocument } from './module-media'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import MACHINE_MODULES from '../catalog/machine-modules.json'

describe('committed module media', () => {
  it('keeps OT media and resolves each Digi module by its machine-qualified ID', () => {
    for (const document of Object.values(MODULE_DOCUMENTS_BY_ID)) {
      expect(moduleMediaDocument(document.id)?.media.map(item => item.path)).toEqual(document.media.map(item => item.path))
    }
    for (const document of MACHINE_MODULES.modules) {
      const media = moduleMediaDocument(document.machine + '-' + document.id)
      expect(media?.version).toBe(document.version)
      expect(media?.media.map(item => item.path)).toEqual(document.media.filter(item => item.kind !== 'thumbnail').map(item => item.path))
    }
    expect(moduleMediaDocument('digitakt-digiutils')?.version).not.toBe(moduleMediaDocument('digitone-kitbank')?.version)
    expect(moduleMediaDocument('digitone-digiutils')).toBeUndefined()
    expect(moduleMediaDocument('unknown-digiutils')).toBeUndefined()
  })
})
