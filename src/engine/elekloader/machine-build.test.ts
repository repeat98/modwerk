import { describe, expect, it, vi } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { MACHINE_DEVICE, planBuild, prepareBuild, prepareLocalBuild, type Builder } from './machine-build.ts'

const stock = new File([new Uint8Array(4)], 'OCTATRACK_OS1.40C.bin')
const pin = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return { file: new File([bytes], 'test.elemod'), sha256: sha(bytes) }
}
const client = () => ({ load: vi.fn(async () => ({ protocol: 1 })), setStock: vi.fn(), addMod: vi.fn(), tick: vi.fn(), check: vi.fn() })
const localClient = () => {
  const fake = client()
  fake.setStock.mockResolvedValue({ ok: true, os: '1.40C', dev: { key: 'octatrack' } })
  fake.addMod.mockImplementation(async (file: File) => ({ ok: true, mod: { path: '/work/mods/' + file.name } }))
  return fake
}

describe('one Elekloader builder for machine extensions', () => {
  it('uses the same device keys and fails closed until an Octatrack core is in the catalogue', async () => {
    expect(MACHINE_DEVICE).toEqual({ octatrack: 'octatrack', digitakt: 'digitakt-mk1', digitone: 'digitone-mk1' })
    expect(planBuild('octatrack', '1.40C', ['repitch'])).toMatchObject({ core: undefined, missing: ['repitch'] })
    const fake = client()
    await expect(prepareBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, moduleIds: [] })).resolves.toEqual({ ok: false, error: 'The catalog has no core for octatrack OS 1.40C.' })
    expect(fake.load).not.toHaveBeenCalled()
  })
  it('refuses changed local packages before touching the worker', async () => {
    const fake = client(), mod = pin({ elemod: 2 })
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [{ ...mod, sha256: '0'.repeat(64) }] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('source-build pin') })
    expect(fake.load).not.toHaveBeenCalled()
  })
  it('refuses whole-image wrappers instead of silently keeping a second composer', async () => {
    const fake = client()
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [pin({ elemod: 1 })] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('linkable format-2') })
    expect(fake.load).not.toHaveBeenCalled()
  })
  it('refuses a mismatched protocol before supplying firmware', async () => {
    const fake = client(); fake.load.mockResolvedValue({ protocol: 2 })
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [pin({ elemod: 2 })] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('protocol') })
    expect(fake.setStock).not.toHaveBeenCalled()
  })
  it('refuses another machine before adding any local modules', async () => {
    const fake = client(); fake.setStock.mockResolvedValue({ ok: true, os: '1.43', dev: { key: 'digitone-mk1' } })
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [pin({ elemod: 2 })] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('selected machine and OS') })
    expect(fake.addMod).not.toHaveBeenCalled()
  })
  it('refuses file-name collisions that replace a pinned package', async () => {
    const fake = localClient()
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [pin({ elemod: 2, id: 'core' }), pin({ elemod: 2, id: 'module' })] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('replaced another') })
    expect(fake.tick).not.toHaveBeenCalled()
    expect(fake.check).not.toHaveBeenCalled()
  })
  it('refuses a dependency chosen from an earlier build without its local pin', async () => {
    const fake = localClient()
    fake.tick.mockImplementation(async (enabled: string[]) => [...enabled, '/work/mods/stale-dependency.elemod'])
    await expect(prepareLocalBuild(fake as unknown as Builder, { machine: 'octatrack', release: '1.40C', stock, mods: [pin({ elemod: 2 })] })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('outside the private build') })
    expect(fake.check).not.toHaveBeenCalled()
  })
})
