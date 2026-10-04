import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseMachineProfile } from './machine-contract'
import GENERATED from './machines.generated.json'

const folder = resolve('sdk/machines')
const profiles = readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => JSON.parse(readFileSync(resolve(folder, entry.name, 'machine.json'), 'utf8')))
const octatrack = () => structuredClone(profiles.find(profile => profile.id === 'octatrack'))
const syntakt = () => structuredClone(profiles.find(profile => profile.id === 'syntakt'))

describe('machine profiles', () => {
  it('validates every machine and matches the generated registry', () => {
    const parsed = profiles.map(parseMachineProfile).sort((a, b) => a.order - b.order)
    expect(parsed.map(profile => profile.id)).toEqual(GENERATED.map(profile => profile.id))
    expect(parsed.filter(profile => profile.sdk).map(profile => profile.id)).toEqual(['octatrack', 'digitakt', 'digitone', 'digitakt-ii'])
  })

  it('keeps status, steps and SDK claims consistent', () => {
    expect(() => parseMachineProfile({ ...octatrack(), sdk: undefined })).toThrow('need firmware and sdk')
    expect(() => parseMachineProfile({ ...octatrack(), steps: { ...octatrack().steps, core: 'started' } })).toThrow('every step done')
    expect(() => parseMachineProfile({ ...syntakt(), steps: { ...syntakt().steps, mods: 'done' } })).toThrow('only machines with mods')
    expect(() => parseMachineProfile({ ...syntakt(), status: 'research' })).toThrow('at least one started step')
    expect(() => parseMachineProfile({ ...syntakt(), status: 'research', steps: { ...syntakt().steps, format: 'started' } })).toThrow('credit the research')
    expect(() => parseMachineProfile({ ...syntakt(), steps: { ...syntakt().steps, format: 'done' } })).toThrow('in research')
  })

  it('accepts only hashes and safe paths, never firmware contents', () => {
    const profile = octatrack()
    profile.firmware.releases[0].files[0].sha256 = 'not-a-hash'
    expect(() => parseMachineProfile(profile)).toThrow('SHA-256')
    expect(() => parseMachineProfile({ ...octatrack(), sdk: { ...octatrack().sdk, modules: '../outside' } })).toThrow('repository path')
    expect(() => parseMachineProfile({ ...octatrack(), id: 'all' })).toThrow('other than "all"')
    expect(() => parseMachineProfile({ ...octatrack(), dump: 'x' })).toThrow('unknown field')
  })
})
