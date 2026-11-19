// SPDX-License-Identifier: GPL-3.0-or-later
// The devices Modwerk's builder carries where the pinned Elekloader kit has none (owner, 19 November 2026). Each is a
// machine's sdk/machines/<id>/elekloader/device.json, which npm run machine:base registers with the kit's Python SDK
// (scripts/machine-base.py, carry_device) and this file with the browser kit, so both builders know the same device.
// The vendored kit stays unchanged: its device list is extended in place, in the page and in the builder's worker.
import DN2_DEVICE from '../../../sdk/machines/digitone-ii/elekloader/device.json' with { type: 'json' }
import { devices, type Device, type Range } from '../../../vendor/elekloader/kit/src/devices.ts'

type Facts = typeof DN2_DEVICE.device
type Num = string | number

const num = (value: Num): number => (typeof value === 'string' ? Number.parseInt(value, 16) : value)
const span = (pair: readonly Num[]): Range => [num(pair[0]), num(pair[1])]

/** The kit's Device for a device.json's facts: no SRAM code area, protected bytes or DSP payloads unless it names them. */
export function carriedDevice(facts: Facts): Device {
  return {
    key: facts.key, name: facts.name, sysexId: num(facts.sysex_id),
    releases: facts.releases.map(r => ({ version: r.version, syxSha256: r.syx_sha256, mainSha256: r.main_sha256, mainLen: r.main_len, binSha256: '' })),
    mainSection: facts.main_section, mainLoad: num(facts.main_load), stage: num(facts.stage),
    flashAt: num(facts.flash_at), flashLimit: num(facts.flash_limit),
    trailer: facts.trailer === 'hmac' ? 'hmac' : null, isa: 'coldfire',
    hmacKeyFrom: [facts.hmac_key_from[0] as number, facts.hmac_key_from[1] as string],
    container: 'ele3', versionLen: 4, versionAt: 0x14, versionOptional: false,
    protected: [], relocatable: [], blobMax: null,
    areas: Object.fromEntries(Object.entries(facts.areas).map(([name, area]) => [name, span(area)])),
    ddr: span(facts.ddr), coreDdr: [], slotClaims: [], sramCode: [0, 0], fastTable: '', imageFree: [], reserve: null,
    dspPayloads: {}, dspAreas: [], recovery: facts.recovery,
  }
}

export const CARRIED_DEVICES: readonly Device[] = [carriedDevice(DN2_DEVICE.device)]

/** Add every carried device the kit does not know to its device list. Idempotent; a kit that ships one keeps its own. */
export function carryDevices(): void {
  const known = devices()
  for (const device of CARRIED_DEVICES) if (!known.some(d => d.key === device.key)) known.push(device)
}
