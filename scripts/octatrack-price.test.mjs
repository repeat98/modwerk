// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { expect, it } from 'vitest'
import { added, reading } from './octatrack-price.mjs'

it('reads the guard window and the mean of the meter readings, and what a module added', () => {
  const guard = share => `frame max 112.2 %, latest start 12.2 %, in the frame interrupt ${share} % over 22000 frames, skipped 2 on T1 T3, share 80.0 %\n`
  const before = reading(guard('41.1') + 'stats cpu 640 T1-4 328/338 T5-8 419/420 passes 1.0 2.0\nstats cpu 660 T1-4 330/338 T5-8 419/420 passes 1.0 2.0\n')
  expect(before).toEqual({ frame: 41.1, frameMax: 112.2, frames: 22000, skipped: 2, cpu: 65, dsp1to4: 32.9, dsp5to8: 41.9 })
  const after = reading(guard('64.5') + 'stats cpu 750 T1-4 428/438 T5-8 419/420 passes 1.0 2.0\n')
  expect(added(before, after)).toEqual({ frame: 23.4, cpu: 10, dsp1to4: 9.9, dsp5to8: 0 })
  expect(() => reading('stats cpu 1 T1-4 1/1 T5-8 1/1')).toThrow('No guard')
})
