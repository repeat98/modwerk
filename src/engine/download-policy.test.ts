import { describe, expect, it } from 'vitest'
import { DOWNLOADS_ENABLED, ENGINE_AVAILABLE } from './protocol'
import { availableModules } from '../catalog/availability'
import { moduleBuildError } from '../catalog/build-support'
import { validateCompiledPackage } from './module-build'

describe('approved public firmware availability', () => {
  it('keeps public builds and downloads enabled while updates are reviewed', () => {
    expect(ENGINE_AVAILABLE).toBe(true)
    expect(DOWNLOADS_ENABLED).toBe(true)
  })
  it('offers only current buildable module versions with their compiled artifacts', () => {
    for (const module of availableModules(true)) {
      expect(moduleBuildError([module.id])).toBe('')
      expect(() => validateCompiledPackage(module.id, module.version)).not.toThrow()
    }
  })
})
