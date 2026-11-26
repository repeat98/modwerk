import { effectInfo } from './zoom-protocol'

/** `default`: the value a patch starts at when this effect is put in a slot. */
export type ZoomParameter = { name: string; max: number; default: number }
export type ZoomEffectControls = { name: string; parameters: ZoomParameter[] }

// SonicStomp descriptor layout documented by Roman Rusinov's MIT extractor.
// Read it from the connected pedal's own file, including for factory effects.
const DESCRIPTOR_SIZE = 0x30
const TABLE_START = [0x4f, 0x6e, 0x4f, 0x66, 0x66, 0] // OnOff\0

export function zoomEffectControls(bytes: number[]): ZoomEffectControls | undefined {
  if (!effectInfo(bytes)) return undefined
  const data = new DataView(Uint8Array.from(bytes).buffer)
  for (let start = bytes.indexOf(TABLE_START[0], 0x50); start >= 0; start = bytes.indexOf(TABLE_START[0], start + 1)) {
    if (!TABLE_START.every((byte, index) => bytes[start + index] === byte)) continue
    const controls = readDescriptor(data, start)
    if (controls) return controls
  }
}

function readDescriptor(data: DataView, start: number): ZoomEffectControls | undefined {
  const parameters: ZoomParameter[] = []
  let name = ''
  for (let index = 0; index < 12; index++) {
    const offset = start + index * DESCRIPTOR_SIZE
    if (offset + DESCRIPTOR_SIZE > data.byteLength) return undefined
    let label = ''
    for (let i = 0; i < 10; i++) {
      const char = data.getUint8(offset + i)
      if (!char) break
      if (char < 0x1f || char > 0x7e) return undefined
      label += char === 0x1f ? 'Hz' : String.fromCharCode(char)
    }
    const max = data.getUint32(offset + 0x0c, true)
    if (index === 1) {
      if (!label || max !== 0xffffffff) return undefined
      name = label
    } else if (index > 1 && label && max !== 0xffffffff) {
      parameters.push({ name: label, max, default: Math.min(data.getUint32(offset + 0x10, true), max) })
    }
    if (data.getUint32(offset + 0x2c, true) & 4) return name ? { name, parameters } : undefined
  }
}
