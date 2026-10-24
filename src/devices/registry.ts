// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Every machine Modwerk knows about (Elektron instruments, Zoom MultiStomp pedals and the Erica Synths LXR-02), with what is known about modding it.
// Facts about devices other than the Octatrack come from public research projects and are linked from each profile.
import MACHINES from './machines.generated.json'
import type { MachineFamily, MachineProfile } from './machine-contract'
import { assetUrl } from '../hosting'

export type DeviceStatus = 'available' | 'preview' | 'research' | 'open'
export type StepState = 'done' | 'started' | 'open'
export type DeviceStepId = 'format' | 'rebuild' | 'source' | 'boot' | 'core' | 'load' | 'mods'

export type DeviceArt = {
  body: 'compact' | 'wide' | 'keys' | 'box' | 'model' | 'pedal' | 'floor'
  encoders: number
  trigs: number
  pads?: number
  knobs?: number
  fader?: boolean
}

export type DeviceProfile = {
  id: string
  name: string
  family: MachineFamily
  variants?: string[]
  status: DeviceStatus
  summary: string
  // file: the newest release's stock OS file; Zoom releases list none (the OS is never modified).
  firmware?: { releases: string[]; file?: string; flash: string; recovery: string }
  steps: Partial<Record<DeviceStepId, StepState>>
  research?: { label: string; url: string; note: string }[]
  sdk?: string
  art: DeviceArt
}

type DeviceStep = { id: DeviceStepId; title: string; description: string }

// The Elektron road: through the OS image.
export const DEVICE_STEPS: DeviceStep[] = [
  { id: 'format', title: 'Firmware file understood', description: 'The OS file’s container, packing and checksums are documented.' },
  { id: 'rebuild', title: 'Stock file rebuilt exactly', description: 'A writer rebuilds the stock OS file byte for byte from its own contents.' },
  { id: 'boot', title: 'Modified OS boots', description: 'A changed OS starts in an emulator or on a real unit and recovers to stock.' },
  { id: 'core', title: 'Core with hooks', description: 'A small core reserves memory and gives mods shared events, so several mods can run together.' },
  { id: 'mods', title: 'First mods', description: 'Reviewed mods with documentation, licences and test evidence.' },
]

// The Zoom MultiStomp road: separate effect files on the stock OS, which is never modified.
const ZOOM_STEPS: DeviceStep[] = [
  { id: 'format', title: 'Effect file understood', description: 'The ZDL container, its ELF and the calling convention for the audio and knob code are documented.' },
  { id: 'load', title: 'Own effect runs', description: 'An effect built from original source loads on the stock firmware, plays and is removed again.' },
  { id: 'mods', title: 'First mods', description: 'Reviewed effects with documentation, licences and test evidence.' },
]

// The Erica Synths road: the firmware source is public (GPL-3.0), so mods are built from it, not patched into a stock image.
const ERICA_STEPS: DeviceStep[] = [
  { id: 'source', title: 'Firmware source builds', description: 'The published source builds an SD-card update image, reproducibly, with the documented toolchain.' },
  { id: 'boot', title: 'Marked build boots', description: 'A build that shows it is modified starts on a real unit, and the official update restores it from the SD card.' },
  { id: 'core', title: 'Modwerk base with hooks', description: 'A base built from the source gives mods shared events and budgets, so several mods can run together.' },
  { id: 'mods', title: 'First mods', description: 'Reviewed mods with documentation, licences and test evidence.' },
]

const FAMILY_STEPS: Record<MachineFamily, DeviceStep[]> = { elektron: DEVICE_STEPS, zoom: ZOOM_STEPS, erica: ERICA_STEPS }

export function deviceSteps(device: Pick<DeviceProfile, 'family'>) {
  return FAMILY_STEPS[device.family]
}

// Where a machine is ready for its first module: the core on Elektron machines; on Zoom pedals a loading effect, on
// Erica Synths machines the Modwerk base, each with an SDK, since Modwerk takes their mods only once a module contract exists.
export function readyForMods(device: Pick<DeviceProfile, 'family' | 'steps' | 'sdk'>) {
  if (device.family === 'elektron') return device.steps.core === 'done'
  return device.steps[device.family === 'zoom' ? 'load' : 'core'] === 'done' && !!device.sdk
}

// Machines come from sdk/machines/<id>/machine.json through scripts/machines.mjs; the UI keeps a compact shape.
export const DEVICES: DeviceProfile[] = (MACHINES as MachineProfile[]).map(machine => ({
  id: machine.id, name: machine.name, family: machine.family, variants: machine.variants, status: machine.status, summary: machine.summary,
  firmware: machine.firmware && {
    releases: machine.firmware.releases.map(release => release.version),
    file: machine.firmware.releases[machine.firmware.releases.length - 1].files[0]?.name,
    flash: machine.firmware.flash, recovery: machine.firmware.recovery,
  },
  steps: machine.steps, research: machine.research, sdk: machine.sdk?.guide, art: machine.art,
}))

export const DEVICES_BY_ID: Record<string, DeviceProfile> = Object.fromEntries(DEVICES.map(device => [device.id, device]))

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Mods available',
  preview: 'Mods in preview',
  research: 'Research started',
  open: 'No mods yet',
}

export function deviceTitle(device: DeviceProfile) {
  return device.variants?.length ? device.name + ' ' + device.variants.join(' / ') : device.name
}

export function stepsDone(device: DeviceProfile) {
  return deviceSteps(device).filter(step => device.steps[step.id] === 'done').length
}

const DEVICE_KEY = 'modwerk.device'

// 'all' is the All machines library; anything else is a machine id.
export const ALL_MACHINES = 'all'

export function rememberedDevice() {
  try { const id = localStorage.getItem(DEVICE_KEY); return id && (id === ALL_MACHINES || DEVICES_BY_ID[id]) ? id : undefined } catch { return undefined }
}

export function rememberDevice(id: string) {
  try { localStorage.setItem(DEVICE_KEY, id) } catch { /* the choice is a convenience only */ }
}

// Library and configuration views keep hash routes; Digitakt/Digitone module pages have public paths.
export type DeviceRoute = { device: DeviceProfile; view: 'library' | 'module' | 'configuration'; category?: string; moduleId?: string }

export function parseDeviceRoute(route: string): DeviceRoute | undefined {
  const [id, section, item, ...rest] = route.split('/')
  const device = DEVICES_BY_ID[id]
  if (!device || device.id === 'octatrack' || rest.length) return undefined
  if (section === undefined) return { device, view: 'library' }
  if (section === 'configuration' && item === undefined) return { device, view: 'configuration' }
  if (section === 'module' && item) return { device, view: 'module', moduleId: item }
  if (item === undefined && section) return { device, view: 'library', category: section }
  return undefined
}

export function deviceHref(id: string, path = '') {
  if (id === 'octatrack') return '#' + (path || 'library')
  if (id === ALL_MACHINES) return '#all'
  if ((id === 'digitakt' || id === 'digitone') && /^module\/[a-z0-9-]+$/.test(path)) return assetUrl(`${id}/${path}/`)
  return '#' + id + (path ? '/' + path : '')
}
