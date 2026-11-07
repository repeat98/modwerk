// The Analog Rytm MKII base lends its send effects a work area from the mods' RAM a set leaves free: from the end of
// every mod's .bss to the end of the area (sdk/machines/analog-rytm-mkii/elekloader/base/sendbus.c). A set whose
// modules leave less than an effect's record asks for links, but the base does not list that effect; this reads a
// linked set's records so a build can say so instead.
import type { Linked } from '../elektron/elemod.ts'

const WORK_OFFSET = 8   // struct mw_fx (include/modwerk/fx.h): abi, id (u16 each), slot, flags (u8 each), trim (u16), work (u32)

/** The words the largest send effect asks for and the words the set leaves it (sendbus.c's room), or undefined for a
 * set without the FX list. Only for a base that lends that RAM: one that imports __bss_end. mainLoad: the device's main
 * OS load address (LINK_DEVICES). */
export function sendFxRoom(linked: Pick<Linked, 'image' | 'tables' | 'layout'>, mainLoad: number) {
  const table = linked.tables.mw_fx
  if (!table) return undefined
  const { runLoad, ddr: [ddrBase], bss: [, bssEnd], ddrSpare } = linked.layout
  const view = new DataView(linked.image.buffer, linked.image.byteOffset, linked.image.byteLength)
  const at = (address: number) => view.getUint32(runLoad - mainLoad + address - ddrBase)
  const [first, count, size] = table
  let largest = 0
  for (let i = 0; i < count; i++) {
    const record = at(first + i * size)
    if (record) largest = Math.max(largest, at(record + WORK_OFFSET))
  }
  const work = (bssEnd + 15) & ~15
  return { largest, room: Math.max(0, Math.floor((bssEnd + ddrSpare - work) / 4)) }
}
