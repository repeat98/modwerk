// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { frameCostTable } from '../src/engine/elekloader/set-package.ts'
import { added, allocationReading, combined, curveFit, curveRoom, measuringCosts, notPlaying, priceInputs, restCost, REST_NOISE, machinePick, stockFit, machineToStatic, pickFailure, priceFileTarget, reading, writePrice, allowanceOf } from './octatrack-price.mjs'

function runtimeEffect(slots) {
  const data = Buffer.alloc(76)
  data.write('MWRM')
  data.writeUInt16BE(8, 4)
  data.writeUInt32BE(0xa01e9876, 28)
  data.writeUInt32BE(2, 32)
  data[39] = slots
  data.write('ECHO WIDE', 50)
  return data
}

it.each([[1, 'fx1'], [2, 'fx2'], [3, 'both'], [0, undefined]])('prices a private file using the package slots %i', (mask, slots) => {
  const data = runtimeEffect(mask)
  expect(priceFileTarget('wide-echo.mwrm', data, [])).toEqual({
    id: 'wide-echo', name: 'ECHO WIDE', slots, version: 'file', file: 'wide-echo.mwrm',
  })
})

it('finds a published package by runtime id even when its file is named after the version', () => {
  const data = runtimeEffect(2), version = '0.1.0-experimental'
  const catalogue = [{ id: 'wide-echo', module: 'a01e9876', version, sha256: createHash('sha256').update(data).digest('hex') }]
  const file = version + '.mwrm'
  expect(priceFileTarget(file, data, catalogue)).toMatchObject({ id: 'wide-echo', version, slots: 'fx2', file })
  const update = runtimeEffect(1)
  expect(priceFileTarget(file, update, catalogue)).toMatchObject({ id: 'wide-echo', version: 'file', slots: 'fx1' })
})

it('reads the guard window and the mean of the meter readings, and what a module added', () => {
  const guard = share => `frame max 112.2 %, latest start 12.2 %, in the frame interrupt ${share} % over 22000 frames, skipped 2 on T1 T3, share 80.0 %\n`
  const before = reading(guard('41.1') + 'stats cpu 640 T1-4 328/338 T5-8 419/420 passes 1.0 2.0\nstats cpu 660 T1-4 330/352 T5-8 419/420 passes 1.0 2.0\n')
  expect(before).toEqual({ frame: 41.1, frameMax: 112.2, frames: 22000, skipped: 2, cpu: 65, dsp1to4: 32.9, dsp5to8: 41.9, dsp1to4Peak: 35.2, dsp5to8Peak: 42 })
  const after = reading(guard('64.5') + 'stats cpu 750 T1-4 428/438 T5-8 419/420 passes 1.0 2.0\n')
  expect(added(before, after)).toEqual({ frame: 23.4, cpu: 10, dsp1to4: 9.9, dsp5to8: 0, dsp1to4Peak: 8.6, dsp5to8Peak: 0 })
  expect(() => reading('stats cpu 1 T1-4 1/1 T5-8 1/1')).toThrow('No guard')
})

it('keeps no peak in what a module added when the reading before it kept none (a record from before the peaks)', () => {
  const old = { frame: 41, frameMax: 74.2, cpu: 60.5, dsp1to4: 38.4, dsp5to8: 45.6 }
  expect(added(old, { ...old, dsp1to4: 45.9, dsp1to4Peak: 50, dsp5to8Peak: 47 })).toEqual({ frame: 0, cpu: 0, dsp1to4: 7.5, dsp5to8: 0 })
})

it('takes several readings of one state as one: means averaged, peaks the highest, and how far they spread', () => {
  const one = (frame, frameMax, dsp1to4, dsp1to4Peak, skipped) => ({ frame, frameMax, frames: 22000, skipped, cpu: 60, dsp1to4, dsp5to8: 40, dsp1to4Peak, dsp5to8Peak: 44 })
  const a = one(41, 74.2, 45.9, 52.1, 0)
  expect(combined([a])).toBe(a) // one reading is the record it always was: no count, no spread
  expect(combined([a, one(41.4, 76.9, 46.3, 58.4, 0), one(40.9, 75, 45.6, 51, 1)])).toEqual({
    frame: 41.1, frameMax: 76.9, frames: 66000, skipped: 1, cpu: 60, dsp1to4: 45.9, dsp5to8: 40, dsp1to4Peak: 58.4, dsp5to8Peak: 44,
    readings: 3, spread: { frame: 0.5, cpu: 0, dsp1to4: 0.7, dsp5to8: 0, frameMax: 2.7, dsp1to4Peak: 7.4, dsp5to8Peak: 0 },
  })
  const allocation = { modulePoolBytes: 0, dspProgramWordsT1to4: 1, dspProgramWordsT5to8: 2 }
  expect(combined([a, { ...a, allocation }]).allocation).toEqual(allocation) // the last reading's, read after them
})

it('records what played: the transport always, the key bus only when the caller says', () => {
  expect(priceInputs(undefined)).toEqual({ transport: 'playing' })
  expect(priceInputs('live')).toEqual({ transport: 'playing', keyBus: 'live' })
  expect(() => priceInputs('on')).toThrow(/--key-bus takes live/)
})

it('records the module pool and each DSP program arena in their own units', () => {
  const report = [
    'pool: 128 of 10912 bytes used; free 10784, largest free run 10784 (100 % of free)',
    'core 1 (T1-4): 388 of 399 words in 1 blocks [id 2 @0+388]; holes 0 words, largest free run 11 of 11 free',
    'core 0 (T5-8): 0 of 399 words in 0 blocks []; holes 0 words, largest free run 399 of 399 free',
    'buffer blocks in use: 0x1',
  ].join('\n')
  expect(allocationReading(report)).toEqual({ modulePoolBytes: 128, dspProgramWordsT1to4: 388, dspProgramWordsT5to8: 0 })
  expect(allocationReading('error: unavailable')).toHaveProperty('unavailable')
})

it('writes a clean reading as the module\'s price, its readings beside it, and takes it off the pending list', async () => {
  const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path'), { tmpdir } = await import('node:os')
  const { parseModuleCpuPrice } = await import('../src/catalog/module-contract.ts')
  const root = mkdtempSync(join(tmpdir(), 'price-write-'))
  try {
    mkdirSync(join(root, 'sdk/octatrack/modules/echo'), { recursive: true })
    const manifest = join(root, 'sdk/octatrack/modules/echo/octamod.module.json')
    writeFileSync(manifest, '{\n  "id": "echo",\n  "version": "0.2.0",\n  "author": {\n    "name": "Jannik A\\u00dffalg"\n  },\n  "compatibility": {\n    "location": "FX2"\n  },\n  "resources": {\n    "recorded": "x"\n  }\n}\n')
    writeFileSync(join(root, 'sdk/module-cpu-prices-pending.json'), JSON.stringify({ about: 'a', pending: { echo: 'price not yet measured', other: 'price not yet measured' } }, null, 1) + '\n')
    const at = (frame, cpu) => ({ frame, cpu }), adds = frame => ({ frame, cpu: 0, dsp1to4: 0, dsp5to8: 0 })
    const result = { id: 'echo', version: 'file', before: at(30.1, 50), atRest: at(30.3, 50.2), atRestAdds: adds(0.2), inUse: at(31.4, 51), inUseAdds: adds(1.3), inUseOn: 'T1 FX2', rolledBack: true }
    const write = changes => writePrice({ root, result: { ...result, ...changes }, base: '945cc074', scene: 'MKII, bank C pattern C01', seconds: 8, measuredAt: '2026-11-17T20:00:00.000Z' })
    expect(write({ refused: 'NO ROOM' })).toMatch(/not clean/)
    expect(write({ notPlayed: 'at rest: the transport was stopped' })).toMatch(/not clean/)
    expect(write({ version: '0.1.0' })).toMatch(/published 0.1.0 but the manifest is 0.2.0/)
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"FX2"', '"FX2",\n    "effectId": 15'))
    expect(write({ inUse: undefined, inUseAdds: undefined })).toMatch(/priced on a slot too/)
    expect(write({})).toMatch(/1.3 % of a frame.*pending list/)
    const text = readFileSync(manifest, 'utf8'), price = JSON.parse(text).resources.cpuPrice
    expect(text).toContain('A\\u00dffalg')
    expect(parseModuleCpuPrice(price)).toMatchObject({ value: 1.3, measure: 'frame-interrupt', date: '2026-11-17', source: 'evidence/cpu-price.json' })
    expect(price.conditions).toBe('MKII, bank C pattern C01; base 945cc074; 8 s per reading. Frame interrupt 30.1 % before, 30.3 % installed and used nowhere, 31.4 % on T1 FX2; CPU meter 50 % before, 50.2 % at rest, 51 % in use.')
    expect(JSON.parse(readFileSync(join(root, 'sdk/octatrack/modules/echo/evidence/cpu-price.json'), 'utf8'))).toMatchObject({ module: 'echo', version: '0.2.0', base: '945cc074', result: { inUseAdds: { frame: 1.3 } } })
    expect(JSON.parse(readFileSync(join(root, 'sdk/module-cpu-prices-pending.json'), 'utf8')).pending).toEqual({ other: 'price not yet measured' })
    // Three readings a state and a named key bus: the record says so, and so do the price's conditions.
    expect(writePrice({ root, result, base: '945cc074', scene: 'MKII, bank C pattern C01', seconds: 8, measuredAt: '2026-11-24T10:00:00.000Z', readings: 3, inputs: priceInputs('live') })).toMatch(/1.3 % of a frame/)
    expect(JSON.parse(readFileSync(manifest, 'utf8')).resources.cpuPrice.conditions).toMatch(/^MKII, bank C pattern C01; base 945cc074; 3 readings of 8 s a state\. Frame interrupt 30.1 % before/)
    expect(JSON.parse(readFileSync(join(root, 'sdk/octatrack/modules/echo/evidence/cpu-price.json'), 'utf8'))).toMatchObject({ readings: 3, inputs: { transport: 'playing', keyBus: 'live' }, seconds: 8 })
    writeFileSync(manifest, JSON.stringify({ id: 'echo', version: '0.2.0', compatibility: { location: 'Track machine' }, resources: {} }))
    expect(write({})).toMatch(/machine-render/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('takes a failed pick for a failure, so the slot is not measured as the effect in use', () => {
  expect(pickFailure('error: No SC Ringmod in the FX2 chooser.\n')).toBe('error: No SC Ringmod in the FX2 chooser.')
  expect(pickFailure('error: RINGMOD SC refused on T1 FX2 (the loader said no; its screen: /tmp/x.png)\n')).toContain('refused')
  expect(pickFailure('T1 FX2 RINGMOD SC (running 119 ms after YES)\n')).toBeNull()
})

it('fits the next-instance cost to a curve without undercharging any measured point', () => {
  // Tape Echo on a busy Part (owner's MKII, 22 Nov 2026): a steep second instance, then cheap ones.
  expect(curveFit([9.2, 16.7, 16.8, 20.5])).toEqual({ first: 13, each: 3.7 })
  // A machine whose voices add up: each track its own render.
  expect(curveFit([19.7, 39.1, 58.9])).toEqual({ first: 19.8, each: 19.8 }) // never below each: the wire sends first - each
  // One or two points: the step there, never below 0; a negative reading counts 0.
  expect(curveFit([5.6])).toEqual({ first: 5.6, each: 5.6 })
  expect(curveFit([9.7, 17.2])).toEqual({ first: 9.7, each: 7.5 })
  expect(curveFit([-0.4, 0.2, 0.1])).toEqual({ first: 0.2, each: 0 })
  for (const adds of [[9.2, 16.7, 16.8, 20.5], [19.7, 39.1, 58.9], [3, 1, 8]]) {
    const { first, each } = curveFit(adds)
    adds.forEach((value, n) => expect(first + n * each).toBeGreaterThanOrEqual(value - 0.05))
  }
})

it('picks a machine by its row and puts the track back on STATIC', () => {
  expect(machinePick('T3')).toContain('T3 T3 w500 LEFT w400 UP*12 w200 DOWN*5 w200 YES')
  expect(machineToStatic('T3')).toMatch(/UP\*12 w200 YES/)
  expect(machineToStatic('T3')).not.toMatch(/DOWN/)
})

it('takes stock\'s reserve from the delays-awake reading and one track\'s share from eight playing tracks', () => {
  // Owner's MKII, 22 Nov 2026: empty C02 40.8 %, eight sample tracks 98.7 %, delays awake 105.6 %.
  expect(stockFit({ empty: 40.8, quiet: 98.7, awake: 105.6 })).toEqual({ reserve: 105.6, trackStock: 7.2 })
  expect(stockFit({ empty: 50, quiet: 40, awake: 39 })).toEqual({ reserve: 40, trackStock: 0 }) // never negative, never under the quiet reading
})

it('counts a module at rest from REST_NOISE up, the readings\' scatter below it as 0', () => {
  expect(restCost({ frameMax: 81 }, { frameMax: 101.3 })).toBe(20.3) // FM Synth 0.1.4 on a medium pattern
  expect(restCost({ frameMax: 80 }, { frameMax: 82.5 })).toBe(2.5)
  expect(restCost({ frameMax: 80.6 }, { frameMax: 79.3 })).toBe(0)  // lower than before: scatter
  expect(restCost({ frameMax: 80 }, { frameMax: 80 + REST_NOISE - 0.1 })).toBe(0)
  expect(restCost(undefined, { frameMax: 90 })).toBe(90 >= REST_NOISE ? 90 : 0)
})

it('refuses a reading the transport did not play, from the session\'s state reply', () => {
  expect(notPlaying('stopped \n')).toBe(true)
  expect(notPlaying('stopped recording\n')).toBe(true)
  expect(notPlaying('playing \n')).toBe(false)
  expect(notPlaying('playing recording\n')).toBe(false)
  expect(notPlaying('error: no answer\n')).toBe(false) // an unknown reply is not counted as stopped
})

it('stops the curve before it starts when the booked first instance leaves no room on the measure pattern', () => {
  // FM Synth 0.1.5 on Dev17 C04 (81 % stock alone, booked 31.3): read at 107.9 %, the overload and not its cost.
  expect(curveRoom({ atRest: 81, booked: 31.3, pattern: '1' })).toMatch(/no room on pattern 1: .*112.3 %, past 100 %.*--measure-pattern/)
  // The same machine on a pattern with room (stock alone 65 %): the curve runs.
  expect(curveRoom({ atRest: 65, booked: 31.3, pattern: '3' })).toBeNull()
  // A module nothing books yet: its first reading decides (curveProblem judges it).
  expect(curveRoom({ atRest: 95, booked: undefined, pattern: '1' })).toBeNull()
})

it('reads a curve with the module\'s each booked at 0 and every other figure as booked', () => {
  const list = { about: 'x', stock: { line: 95 }, costs: { grain: { first: 33.3, each: 33.3, rest: 0, points: [33.3] }, amiga: { first: 26.6, each: 4, rest: 0.1 } } }
  const measuring = measuringCosts(list, 'grain')
  expect(measuring.costs.grain).toEqual({ first: 33.3, each: 0, rest: 0, points: [33.3] })
  expect(measuring.costs.amiga).toBe(list.costs.amiga)
  expect(measuring.stock).toBe(list.stock)
  expect(list.costs.grain.each).toBe(33.3) // the checkout's table is not changed
  // What the unit is sent: a further instance adds 0 per mille, the first still its booked 33.3 (wake).
  expect(frameCostTable({ grain: measuring.costs.grain }, null)).toEqual([{ module: frameCostTable({ grain: list.costs.grain }, null)[0].module, use: 0, wake: 333, rest: 0 }])
  // Unbooked: the unit charges it by its descriptor, and its table is left alone.
  expect(measuringCosts(list, 'syntiz')).toBeNull()
  expect(measuringCosts(null, 'grain')).toBeNull()
})

it('reads the Part\'s CPU allowance from the session\'s cpu reply, so a curve can put it back', () => {
  expect(allowanceOf('allowance 45 %, booked 35 %, refused -\nguarded renders, longest since the last read: T1 53.2\n')).toBe(45)
  expect(allowanceOf('allowance 400 %, booked 0 %, refused T3\n')).toBe(400)
  expect(allowanceOf('error: this base does not answer CPU\n')).toBeUndefined() // then the curve leaves the allowance alone
})
