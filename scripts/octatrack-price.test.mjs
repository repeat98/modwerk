// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { expect, it } from 'vitest'
import { added, pickFailure, reading, writePrice } from './octatrack-price.mjs'

it('reads the guard window and the mean of the meter readings, and what a module added', () => {
  const guard = share => `frame max 112.2 %, latest start 12.2 %, in the frame interrupt ${share} % over 22000 frames, skipped 2 on T1 T3, share 80.0 %\n`
  const before = reading(guard('41.1') + 'stats cpu 640 T1-4 328/338 T5-8 419/420 passes 1.0 2.0\nstats cpu 660 T1-4 330/338 T5-8 419/420 passes 1.0 2.0\n')
  expect(before).toEqual({ frame: 41.1, frameMax: 112.2, frames: 22000, skipped: 2, cpu: 65, dsp1to4: 32.9, dsp5to8: 41.9 })
  const after = reading(guard('64.5') + 'stats cpu 750 T1-4 428/438 T5-8 419/420 passes 1.0 2.0\n')
  expect(added(before, after)).toEqual({ frame: 23.4, cpu: 10, dsp1to4: 9.9, dsp5to8: 0 })
  expect(() => reading('stats cpu 1 T1-4 1/1 T5-8 1/1')).toThrow('No guard')
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
    writeFileSync(manifest, JSON.stringify({ id: 'echo', version: '0.2.0', compatibility: { location: 'Track machine' }, resources: {} }))
    expect(write({})).toMatch(/machine-render/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('takes a failed pick for a failure, so the slot is not measured as the effect in use', () => {
  expect(pickFailure('error: No SC Ringmod in the FX2 chooser.\n')).toBe('error: No SC Ringmod in the FX2 chooser.')
  expect(pickFailure('error: RINGMOD SC refused on T1 FX2 (the loader said no; its screen: /tmp/x.png)\n')).toContain('refused')
  expect(pickFailure('T1 FX2 RINGMOD SC (running 119 ms after YES)\n')).toBeNull()
})
