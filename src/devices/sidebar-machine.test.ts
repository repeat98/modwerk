import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALL_MACHINES, DEVICES_BY_ID, lastMachine, rememberDevice } from './registry'
import { sidebarMachine, type SidebarMachineInput } from './sidebar-machine'

const octatrack = DEVICES_BY_ID.octatrack, pedal = DEVICES_BY_ID['zoom-ms-70cdr'], research = DEVICES_BY_ID['digitone-ii']
const overview: SidebarMachineInput = { allMachines: true, current: octatrack, currentTakesSets: false, currentHasSet: false, lastTakesSets: false, octatrackConnected: false, octatrackPage: false }
const card = (input: Partial<SidebarMachineInput>) => { const { device, pedal } = sidebarMachine({ ...overview, ...input }); return [device.id, pedal] }

describe('the sidebar instrument card', () => {
  it('shows a connected Octatrack on the overview, not the machine of the set edited last', () => {
    expect(card({ octatrackConnected: true, last: pedal, lastTakesSets: true })).toEqual(['octatrack', false])
  })

  it('shows the last machine whose pages were open on the overview, else the Octatrack', () => {
    expect(card({ last: pedal, lastTakesSets: true })).toEqual(['zoom-ms-70cdr', false])
    expect(card({ last: research, lastTakesSets: false })).toEqual(['octatrack', false])
    expect(card({})).toEqual(['octatrack', false])
  })

  it('lets a connected pedal take the card only on its own pages or while no Octatrack is connected', () => {
    expect(card({ pedalConnected: pedal, octatrackConnected: true })).toEqual(['octatrack', false])
    expect(card({ pedalConnected: pedal })).toEqual(['zoom-ms-70cdr', true])
    expect(card({ allMachines: false, current: pedal, currentTakesSets: true, pedalConnected: pedal, octatrackConnected: true })).toEqual(['zoom-ms-70cdr', true])
    expect(card({ allMachines: false, current: octatrack, currentTakesSets: true, pedalConnected: pedal, octatrackConnected: true })).toEqual(['octatrack', false])
    expect(card({ octatrackPage: true, pedalConnected: pedal })).toEqual(['octatrack', false])
    expect(card({ pedalPage: pedal, octatrackConnected: true })).toEqual(['zoom-ms-70cdr', true])
  })

  it('shows the page’s own machine on a machine’s pages', () => {
    expect(card({ allMachines: false, current: pedal, currentTakesSets: true })).toEqual(['zoom-ms-70cdr', false])
    expect(card({ allMachines: false, current: research, currentTakesSets: false })).toEqual(['octatrack', false])
    expect(card({ allMachines: false, current: research, currentTakesSets: false, currentHasSet: true })).toEqual([research.id, false])
  })
})

describe('the last machine', () => {
  afterEach(() => vi.unstubAllGlobals())
  function stubStorage(values: Record<string, string> = {}) {
    vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value } })
    return values
  }

  it('survives the overview remembering All machines', () => {
    stubStorage()
    rememberDevice('zoom-ms-70cdr')
    rememberDevice(ALL_MACHINES)
    expect(lastMachine()).toBe('zoom-ms-70cdr')
  })

  it('falls back to a machine remembered before it existed, and ignores All machines and unknown ids', () => {
    stubStorage({ 'modwerk.device': 'octatrack' })
    expect(lastMachine()).toBe('octatrack')
    stubStorage({ 'modwerk.device': ALL_MACHINES })
    expect(lastMachine()).toBeUndefined()
    stubStorage({ 'modwerk.machine': 'gone' })
    expect(lastMachine()).toBeUndefined()
  })
})
