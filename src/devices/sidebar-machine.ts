import { DEVICES_BY_ID, type DeviceProfile } from './registry'

export type SidebarMachineInput = {
  /** The overview, All machines, and machine-less pages after them. */
  allMachines: boolean
  /** The machine the page is about (App's currentDevice) and whether it takes sets. */
  current: DeviceProfile
  currentTakesSets: boolean
  /** The machine of the set this page edits, when there is one. */
  currentHasSet: boolean
  /** The last machine whose pages were open (registry lastMachine), and whether that machine takes sets. */
  last?: DeviceProfile
  lastTakesSets: boolean
  octatrackConnected: boolean
  /** The pedal of the Zoom pedal page that is open, and a Zoom pedal connected over its link. */
  pedalPage?: DeviceProfile
  pedalConnected?: DeviceProfile
  /** Your Octatrack and the Octatrack set page. */
  octatrackPage: boolean
}

/**
 * The machine the sidebar's instrument card shows, and whether it is shown as a pedal.
 * A machine's own pages show that machine. The overview and All machines show a connected Octatrack, else the last
 * machine whose pages were open, else the Octatrack: never the machine of whichever set was edited last.
 * A connected pedal takes the card on its own pages, and elsewhere only while no Octatrack is connected.
 */
export function sidebarMachine(input: SidebarMachineInput): { device: DeviceProfile; pedal: boolean } {
  const { allMachines, current, pedalPage, pedalConnected, octatrackConnected } = input
  if (pedalPage) return { device: pedalPage, pedal: true }
  const pedalsOwnPage = !allMachines && current.id === pedalConnected?.id
  if (pedalConnected && !input.octatrackPage && (pedalsOwnPage || !octatrackConnected)) return { device: pedalConnected, pedal: true }
  if (!allMachines) return { device: input.currentHasSet || input.currentTakesSets ? current : DEVICES_BY_ID.octatrack, pedal: false }
  const last = !octatrackConnected && input.last && input.lastTakesSets ? input.last : undefined
  return { device: last ?? DEVICES_BY_ID.octatrack, pedal: false }
}
