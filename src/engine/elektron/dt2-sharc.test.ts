import { describe, expect, it } from 'vitest'
import { combineDt2Plans, planDt2MachinePlayers, planDt2MachineSelectors } from './dt2-sharc'

// No Elektron firmware here: the stock-dependent checks are proved locally against the owner's OS file, and these
// tests cover what does not need it.
const allocation = (address: number) => ({ address, bytes: new Uint8Array(8) })
const site = (address: number) => ({ address, guard: '0'.repeat(64), instruction: new Uint8Array(6) })

describe('Digitakt II SHARC plans', () => {
  it('combines a render plan with base sites and keeps every allocation', () => {
    const render = { renderInstruction: Uint8Array.of(1, 2, 3, 4, 5, 6), allocations: [allocation(0x200a0000)] }
    const machines = { sites: [site(0x28384e62)], allocations: [allocation(0x200c0100)] }
    expect(combineDt2Plans(render, null, machines)).toEqual({
      renderInstruction: render.renderInstruction,
      receiveInstruction: undefined,
      sites: machines.sites,
      allocations: [...render.allocations, ...machines.allocations],
    })
    expect(combineDt2Plans(null)).toBeNull()
  })

  it('refuses two plans that set the same fixed site', () => {
    const render = { renderInstruction: new Uint8Array(6), allocations: [allocation(0x200a0000)] }
    expect(() => combineDt2Plans(render, render)).toThrow('Two SHARC plans set the same site')
  })

  it('refuses a SHARC section that is not the pinned stock image before reading it', async () => {
    await expect(planDt2MachineSelectors(new Uint8Array(64), 0x200c0100, [0])).rejects.toThrow('Unsupported Digitakt II SHARC image')
    await expect(planDt2MachinePlayers(new Uint8Array(64), 0x200c1000, 0x200c2000, [{ type: 7, entry: 0xbe0858 }]))
      .rejects.toThrow('Unsupported Digitakt II SHARC image')
  })
})
