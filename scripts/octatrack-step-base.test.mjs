import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootOverPendingUpdate, stageRefusal } from './octatrack-step-base.mjs'

// SLOTS as upload-usb.ts parseBaseSlots gives them: slot A the confirmed old base, slot B the newer update.
const slots = (b, running = null) => ({ layout: 'two', running, fellBack: false, confirmed: false, slots: [
  { generation: 6, whole: true, confirmed: true, tries: 1 }, { generation: 7, whole: true, confirmed: false, tries: 0, ...b }] })

describe('bootOverPendingUpdate', () => {
  it('lets the boot go when nothing is pending', () => {
    expect(bootOverPendingUpdate(undefined)).toBeUndefined() // a base before the two slots
    expect(bootOverPendingUpdate(null)).toBeUndefined() // before the base's first look
    expect(bootOverPendingUpdate({ layout: 'one', running: null, fellBack: false, confirmed: false, slots: [] })).toBeUndefined()
    expect(bootOverPendingUpdate(slots({ confirmed: true, tries: 1 }, 1))).toBeUndefined()
    expect(bootOverPendingUpdate(slots({ tries: 3 }, 0))).toBeUndefined() // already went back: UPDATE UNDONE
    expect(bootOverPendingUpdate(slots({ whole: false }, 0))).toBeUndefined() // a cut write never counts
  })
  it('refuses over an update written and not yet started, and says how to confirm it', () => {
    const { refusal, wait } = bootOverPendingUpdate(slots({ tries: 0 }, 0))
    expect(wait).toBeUndefined()
    expect(refusal).toContain('slot B is not confirmed yet (0 of its 2 starts used)')
    expect(refusal).toContain('Power-cycle it')
    expect(refusal).toContain('--spend-tries')
  })
  it('refuses on a RAM-booted base over an update started once (20 November 2026)', () => {
    expect(bootOverPendingUpdate(slots({ tries: 1 })).refusal).toContain('(1 of its 2 starts used)')
  })
  it('waits while the update itself runs, which confirms itself', () => {
    const pending = bootOverPendingUpdate(slots({ tries: 1 }, 1))
    expect(pending.wait).toBe(true)
    expect(pending.refusal).toContain('one of its 1 start left')
    expect(bootOverPendingUpdate(slots({ tries: 2 }, 1)).refusal).toContain('it has no start left')
  })
  it('only warns when the update has no start left and is not running: the next restart undoes it either way', () => {
    const pending = bootOverPendingUpdate(slots({ tries: 2 }))
    expect(pending.refusal).toBeUndefined()
    expect(pending.warning).toContain('no start left')
  })
  it('takes the newest whole slot as the stub does (slots.c slot_newest)', () => {
    const swapped = { layout: 'two', running: null, fellBack: false, confirmed: false, slots: [
      { generation: 9, whole: true, confirmed: false, tries: 1 }, { generation: 8, whole: true, confirmed: true, tries: 1 }] }
    expect(bootOverPendingUpdate(swapped).refusal).toContain('slot A')
  })
})

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
