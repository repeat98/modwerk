import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { SIZES, baseLimits, baseSizeReport, checkBaseSize, touchesBaseSize, withRecord } from './base-size.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const limits = { container: 851712, main: 1572864 }
const id = digit => digit.repeat(64)
const binding = { identity: id('b'), variants: { 'tracks-main-cue': id('b'), off: id('c') } }
const versions = { bases: [{ version: '0.8', identities: [id('b'), id('c')] }] }
const sizes = { schema: 1, bases: [
  { base: 'aaaaaaaa', identity: id('a'), layouts: { 'tracks-main-cue': { main: 1310000, container: 790000 }, off: { main: 1309000, container: 789000 } } },
  { base: '0.8', identity: id('b'), layouts: { 'tracks-main-cue': { main: 1316000, container: 795248 }, off: { main: 1315000, container: 794000 } } },
] }
const folders = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('base size', () => {
  it('prints the largest layout against the container limit and the change since the previous base', () => {
    expect(baseSizeReport({ sizes, binding, versions, limits })).toEqual({ problems: [],
      line: 'Octatrack base 0.8: 795,248 of 851,712 container bytes, 56,464 free; +5,248 since aaaaaaaa (largest layout tracks-main-cue; MAIN 1,316,000 of 1,572,864)' })
    const shrunk = { ...sizes, bases: [sizes.bases[0], { ...sizes.bases[1], layouts: { ...sizes.bases[1].layouts, 'tracks-main-cue': { main: 1300000, container: 780000 } } }] }
    expect(baseSizeReport({ sizes: shrunk, binding, versions, limits }).line).toContain('794,000 of 851,712 container bytes, 57,712 free; +4,000 since aaaaaaaa (largest layout off;')
    expect(baseSizeReport({ sizes: { schema: 1, bases: [sizes.bases[1]] }, binding, versions, limits }).line).not.toContain('since')
  })
  it('fails a base over either limit', () => {
    const over = withRecord(sizes, { ...sizes.bases[1], layouts: { 'tracks-main-cue': { main: 1572865, container: 851713 }, off: { main: 1, container: 1 } } })
    const { line, problems } = baseSizeReport({ sizes: over, binding, versions, limits })
    expect(line).toContain('851,713 of 851,712 container bytes, 1 over')
    expect(problems).toEqual([expect.stringContaining('tracks-main-cue: its packed container is 851,713 bytes, 1 more than the 851,712'),
      expect.stringContaining('tracks-main-cue: its MAIN image is 1,572,865 bytes, 1 more than a USB update takes')])
  })
  it('fails a committed base with no record, a record that is not the newest, or other layouts', () => {
    const fresh = { identity: id('d'), variants: { off: id('d') } }
    expect(baseSizeReport({ sizes, binding: fresh, versions, limits }).problems).toEqual([expect.stringContaining('no record of the committed base dddddddd (dddddddd): run node scripts/base-size.mjs --stock')])
    expect(baseSizeReport({ sizes, binding: { identity: id('a') }, versions, limits }).problems).toEqual([
      expect.stringContaining('the committed base aaaaaaaa is not the last record'), expect.stringContaining('records the layouts off, tracks-main-cue of base aaaaaaaa, which has tracks-main-cue')])
  })
  it('records a base as the newest, replacing an earlier record of the same base or version', () => {
    const again = { base: '0.8', identity: id('e'), layouts: {} }
    expect(withRecord(sizes, again).bases.map(base => base.identity)).toEqual([id('a'), id('e')])
    expect(withRecord(sizes, sizes.bases[0]).bases.map(base => base.identity)).toEqual([id('b'), id('a')])
  })
  it('reads the limits from the base source and runs for changes that can move them', () => {
    expect(baseLimits(root)).toEqual(limits)
    for (const path of ['src/engine/assets/octatrack-base.elemod', 'src/engine/assets/octatrack-base-variants.json', 'sdk/machines/octatrack/base-binding.json',
      SIZES, 'sdk/machines/octatrack/elekloader/flash.h', 'sdk/machines/octatrack/elekloader/build_core.py', 'scripts/base-size.mjs'])
      expect(touchesBaseSize(path), path).toBe(true)
    for (const path of ['src/engine/assets/coldfire-packages.json', 'sdk/machines/octatrack/events.json', 'docs/OCTATRACK_TWO_SLOT_BASE.md', 'scripts/base-size.test.mjs'])
      expect(touchesBaseSize(path), path).toBe(false)
    const folder = mkdtempSync(join(tmpdir(), 'base-size-')), elekloader = join(folder, 'sdk/machines/octatrack/elekloader')
    folders.push(folder)
    mkdirSync(elekloader, { recursive: true })
    writeFileSync(join(elekloader, 'flash.h'), '#define FLASH_CONTAINER_BYTES 0xd0000u\n')
    writeFileSync(join(elekloader, 'build_core.py'), 'USB_UPDATE_BYTES = 0x180000  # moved\n')
    expect(() => baseLimits(folder)).toThrow('read it anew')
  })
  it('passes for the committed base', () => {
    expect(checkBaseSize(root)).toMatch(/^Octatrack base [\d.]+: [\d,]+ of 851,712 container bytes, [\d,]+ free/)
  })
})
