import { describe, expect, it } from 'vitest'
import { combineDt2Plans, planDt2FrameReceive, planDt2MachinePlayers, planDt2MachineSelectors } from './dt2-sharc'

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

  it('passes frame receivers on, and never sets the receive site for them', () => {
    const render = { renderInstruction: new Uint8Array(6), allocations: [allocation(0x200a0000)], frameReceivers: [0x200a0000] }
    const plan = combineDt2Plans(render, { allocations: [allocation(0x200c0100)] })!
    expect(plan.frameReceivers).toEqual([0x200a0000])
    expect(plan.receiveInstruction).toBeUndefined()
  })

  it('refuses a SHARC section that is not the pinned stock image before reading it', async () => {
    const stock = new Uint8Array(64)
    await expect(planDt2MachineSelectors(stock, 0x200c0100, [0, 0, 0, 0])).rejects.toThrow('Unsupported Digitakt II SHARC image')
    await expect(planDt2MachinePlayers(stock, 0x200c1000, 0x200c2000, 0x200c0f00, [{ type: 7, entry: 0xbe0858 }], 0x200c2cf4))
      .rejects.toThrow('Unsupported Digitakt II SHARC image')
    await expect(planDt2FrameReceive(stock, 0x200c2800, 0x200c2c00, 0x200c0f80, [])).rejects.toThrow('Unsupported Digitakt II SHARC image')
  })
})
