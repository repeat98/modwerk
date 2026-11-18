import { MACHINE_STACK } from './machine-contract'
import { deviceSteps, type DeviceProfile } from './registry'

// Where a machine stands on its road, as its machine page shows it: its family's steps to the first mod, then the
// Octatrack's stack (docs/MACHINE_RECIPE.md), each with its state and the first one not done yet.
export function machineRoad(device: Pick<DeviceProfile, 'family' | 'steps' | 'stack'>) {
  const steps = deviceSteps(device).map(step => ({ ...step, state: device.steps[step.id] ?? 'open' }))
  const stack = MACHINE_STACK.map(piece => ({ ...piece, state: device.stack[piece.id] ?? 'open' }))
  return { steps, next: steps.find(step => step.state !== 'done'), stack, nextPiece: stack.find(piece => piece.state !== 'done') }
}
