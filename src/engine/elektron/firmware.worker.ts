// SPDX-License-Identifier: GPL-3.0-or-later
import { inspectDigiFirmware, type DigiMachine } from './firmware'

self.onmessage = async (event: MessageEvent<{ id: number; machine: DigiMachine; name: string; buffer: ArrayBuffer }>) => {
  const { id, machine, name, buffer } = event.data
  try {
    if (!['digitakt', 'digitakt-ii', 'digitone', 'analog-rytm-mkii'].includes(machine) || !(buffer instanceof ArrayBuffer)) throw new Error('Invalid local firmware request.')
    const inspection = await inspectDigiFirmware(machine, new Uint8Array(buffer), name)
    self.postMessage({ id, type: 'inspection', inspection })
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Could not read this firmware.' })
  }
}
