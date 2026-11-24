import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stageRefusal } from './octatrack-step-base.mjs'

describe('stageRefusal', () => {
  it('passes an image the running base stages', () => {
    expect(stageRefusal('MAIN.raw', 1308969, 1310720)).toBeUndefined()
    expect(stageRefusal('MAIN.raw', 1310720, 1310720)).toBeUndefined()
  })
  it('passes when the base reports no capacity', () => {
    expect(stageRefusal('MAIN.raw', 1347890, undefined)).toBeUndefined()
  })
  it('refuses a base 0.8 image on a 1.25 MiB stage and names the step base', () => {
    const message = stageRefusal('MAIN.raw', 1347890, 1310720)
    expect(message).toContain('1347890 bytes, more than the 1310720')
    expect(message).toContain('nothing was sent')
    expect(message).toContain('--step --out STEP-DIR')
  })
  it('says the image already went out once when the flashed base it fell back to is too small', () => {
    const message = stageRefusal('MAIN.raw', 1347890, 1310720, true)
    expect(message).toContain('the flashed base the unit came back on')
    expect(message).not.toContain('nothing was sent')
  })
})

describe('octatrack:base --step', () => {
  const run = (...args) => spawnSync(process.execPath, [join(import.meta.dirname, 'octatrack-base.mjs'), '--stock', 'absent.bin', ...args], { encoding: 'utf8' })
  it('needs --out', () => {
    const result = run('--step')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('--step takes only --stock and --out NEW-DIR.')
  })
  it('refuses an output folder inside a checkout', () => {
    const result = run('--step', '--out', join(import.meta.dirname, 'step-base-test-out'))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Save firmware outside every Git checkout.')
  })
  it('takes no beta or write flags', () => {
    const result = run('--step', '--beta', '--write', '--out', 'unused')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/--step takes only --stock and --out NEW-DIR, not (--write, --beta|--beta, --write)\./)
  })
})
