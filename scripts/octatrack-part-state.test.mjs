import { describe, expect, it } from 'vitest'
import { BANK_POINTER, NOW, PART, PART_BYTES, bankBase, bankPrograms, banksOf, copyAt, readStart, restore, where } from './octatrack-part-state.mjs'

/** A unit as the device session shows it: position bytes, each Part's working and saved copy (one fill byte each), the
 * transport, and the Part menu's SAVE and RELOAD; RELOAD is refused on a Part not saved since the boot (SAVE PART FIRST!). */
function fakeUnit({ bank = 2, pattern = 0, part = 0, stopped = true, savedSinceBoot = [], dirty = [], layout = bankBase } = {}) {
  const unit = { bank, pattern, part, stopped, sent: [], saves: new Set(savedSinceBoot), copies: new Map() }
  const copy = (b, p) => { const key = b + ':' + p; if (!unit.copies.has(key)) unit.copies.set(key, { working: 0x11 + p, saved: 0x11 + p }); return unit.copies.get(key) }
  for (const [b, p] of dirty) copy(b, p).working = 0x99
  unit.edit = (b, p, byte = 0x77) => { copy(b, p).working = byte }
  unit.overwriteSaved = (b, p) => { copy(b, p).saved = 0x55 }
  unit.copy = copy
  const hex = (bytes, length = bytes.length) => Buffer.from(bytes.length === 1 && length > 1 ? Array(length).fill(bytes[0]) : bytes).toString('hex')
  const memory = (at, length) => {
    if (at === NOW) return hex([unit.bank, unit.pattern])
    if (at === PART) return hex([unit.part])
    if (at === BANK_POINTER) return layout(unit.bank).toString(16).padStart(8, '0')
    for (let b = 0; b < 16; b++) for (let p = 0; p < 4; p++) for (const saved of [false, true])
      if (copyAt(b, p, saved) === at) return hex([saved ? copy(b, p).saved : copy(b, p).working], length)
    throw new Error('no such address 0x' + at.toString(16))
  }
  let chooseBank = false
  unit.send = async line => {
    unit.sent.push(line)
    const out = []
    for (const step of line.split(/\s+/)) {
      let m
      if (step === 'state') out.push(unit.stopped ? 'stopped ' : 'playing ')
      else if ((m = /^mem:0x([0-9a-f]+):(\d+)$/.exec(step))) out.push(memory(parseInt(m[1], 16), Number(m[2])))
      else if (step === 'STOP') unit.stopped = true
      else if (step === 'BANK') chooseBank = 'bank'
      else if ((m = /^TRIG(\d+)$/.exec(step)) && chooseBank === 'bank') { unit.bank = Number(m[1]) - 1; chooseBank = 'pattern' }
      else if ((m = /^TRIG(\d+)$/.exec(step)) && chooseBank === 'pattern') { unit.pattern = Number(m[1]) - 1; chooseBank = false }
      else if ((m = /^part(\d)$/.exec(step))) unit.part = Number(m[1]) - 1
      else if (step === 'savepart') { copy(unit.bank, unit.part).saved = copy(unit.bank, unit.part).working; unit.saves.add(unit.bank + ':' + unit.part) }
      else if (step === 'reload') { if (unit.saves.has(unit.bank + ':' + unit.part)) copy(unit.bank, unit.part).working = copy(unit.bank, unit.part).saved }
    }
    return out.join('\n') + '\n'
  }
  return unit
}

describe('reading the start', () => {
  it('notes the position and every Part of the bank, and SAVEs a clean current Part once so that RELOAD works at the end', async () => {
    const unit = fakeUnit({ bank: 2, pattern: 3 })
    const start = await readStart(unit.send)
    expect(start).toMatchObject({ bank: 2, pattern: 3, part: 0, stopped: true, saved: true })
    expect(start.banks[2]).toHaveLength(4)
    expect(start.banks[2].every(part => part.clean)).toBe(true)
    expect(unit.sent).toContain('NO w200 savepart')
    expect(start.summary).toBe('Part 1 on C04: working = saved, saved once so that RELOAD works at the end')
  })

  it('never saves over a Part that differs from its saved copy, nor while playing', async () => {
    const dirty = fakeUnit({ dirty: [[2, 0]] })
    const start = await readStart(dirty.send)
    expect(start.saved).toBe(false)
    expect(dirty.sent.some(line => line.includes('savepart'))).toBe(false)
    expect(start.summary).toMatch(/differs from its saved copy, so the run leaves it as found.*#a-test-bank/)
    const playing = fakeUnit({ stopped: false })
    expect((await readStart(playing.send)).summary).toMatch(/not saved once, as the transport was playing/)
    expect(playing.sent.some(line => line.includes('savepart'))).toBe(false)
  })

  it('reads the banks the soak\'s programs reach as well, and refuses a bank layout it does not know', async () => {
    expect(banksOf('0-3,32-35')).toEqual([0, 2])
    expect(bankPrograms(2)).toBe('32-35')
    expect(where(15, 15)).toBe('P16')
    expect(Object.keys((await readStart(fakeUnit({ bank: 2 }).send, { banks: banksOf('0-3') })).banks)).toEqual(['0', '2'])
    await expect(readStart(fakeUnit({ layout: () => 0x40000000 }).send)).rejects.toThrow(/OS 1.40C keeps bank C/)
  })

  it('reads every copy whole: 6,322 bytes a Part', async () => {
    const unit = fakeUnit()
    await readStart(unit.send)
    expect(unit.sent.find(line => line.includes(':' + PART_BYTES))).toContain(`mem:0x${copyAt(2, 0, false).toString(16)}:6322 mem:0x${copyAt(2, 0, true).toString(16)}:6322`)
  })
})

describe('putting it back', () => {
  it('stops, goes back to the start bank, pattern and Part, and RELOADs the Part the run edited', async () => {
    const unit = fakeUnit({ bank: 2, pattern: 0 })
    const start = await readStart(unit.send)
    // What a soak leaves: playing on bank A pattern 3, the Part switched and edited by CCs.
    Object.assign(unit, { bank: 0, pattern: 2, stopped: false })
    unit.part = 1
    unit.edit(2, 0)
    const result = await restore(unit.send, start)
    expect(result).toMatchObject({ ok: true, problems: [] })
    expect(result.actions).toEqual(['transport stopped', 'back on C01 from A03', 'Part 1 selected again', 'Part 1 on C01 reloaded'])
    expect(result.summary).toBe('Part 1 on C01: transport stopped, back on C01 from A03, Part 1 selected again, Part 1 on C01 reloaded; working = saved')
    expect([unit.bank, unit.pattern, unit.part, unit.stopped]).toEqual([2, 0, 0, true])
    expect(unit.copy(2, 0).working).toBe(unit.copy(2, 0).saved)
  })

  it('changes nothing on a Part that is already as saved', async () => {
    const unit = fakeUnit()
    const start = await readStart(unit.send)
    unit.sent.length = 0
    const result = await restore(unit.send, start)
    expect(result).toMatchObject({ ok: true, actions: [], summary: 'Part 1 on C01: nothing to put back; working = saved' })
    expect(unit.sent.some(line => line.includes('reload'))).toBe(false)
  })

  it('fails loudly, with the fix, when RELOAD is refused (SAVE PART FIRST!: never saved since the RAM boot)', async () => {
    const unit = fakeUnit({ stopped: false }) // playing at the start: step 6 could not save it
    const start = await readStart(unit.send)
    unit.edit(2, 0)
    const result = await restore(unit.send, start)
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual([expect.stringMatching(/^RELOAD did not bring Part 1 on C01 back \(SAVE PART FIRST!: step 6 could not save it.*put it back by hand \(docs\/OCTATRACK_DRIVING.md#the-rules\)/)])
    expect(unit.sent.slice(-2)[0]).toBe('NO w200') // the message closed
  })

  it('leaves a Part that differed at the start as found, never discarding edits the run did not make', async () => {
    const unit = fakeUnit({ dirty: [[2, 0]], savedSinceBoot: ['2:0'] })
    const start = await readStart(unit.send)
    unit.edit(2, 0, 0x66)
    const result = await restore(unit.send, start)
    expect(result).toMatchObject({ ok: true, summary: expect.stringMatching(/differed from its saved copy at the start, so it was left as found/) })
    expect(unit.sent.some(line => line.includes('reload'))).toBe(false)
    expect(unit.copy(2, 0).working).toBe(0x66)
  })

  it('fails when the run changed another Part that was saved at the start, or saved over the start Part', async () => {
    const other = fakeUnit()
    const start = await readStart(other.send)
    other.edit(2, 2)
    expect((await restore(other.send, start)).problems).toEqual([expect.stringMatching(/^Part 3 of bank C was saved at the start and differs now: reload it by hand.*--soak-programs 32-35/)])
    const savedOver = fakeUnit()
    const first = await readStart(savedOver.send)
    savedOver.overwriteSaved(2, 0)
    expect((await restore(savedOver.send, first)).problems).toEqual([expect.stringMatching(/saved copy of Part 1 on C01 changed during the run/)])
  })

  it('says so when it cannot get back to the start pattern, and touches no Part then', async () => {
    const unit = fakeUnit()
    const start = await readStart(unit.send)
    unit.bank = 5
    const send = async line => (line.startsWith('BANK') ? '' : unit.send(line)) // the bank change is lost
    const result = await restore(send, start)
    expect(result.problems).toEqual([expect.stringMatching(/^not back on C01 \(it is on F01\): select it by hand \(BANK, TRIG 3, TRIG 1\)/)])
    expect(unit.sent.some(line => line.includes('reload'))).toBe(false)
  })
})
