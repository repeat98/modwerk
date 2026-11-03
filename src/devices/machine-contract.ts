// Machine profiles (sdk/machines/<id>/machine.json): one strict contract for every machine, Elektron and others.
// Shared by the website (through the generated registry) and stock-free repository checks. No firmware is read.

export const MACHINE_STATUSES = ['available', 'preview', 'research', 'open'] as const
export const MACHINE_FAMILIES = ['elektron', 'zoom', 'erica'] as const
// Each family's road to mods. Elektron machines are modded through the OS image; Zoom MultiStomp
// pedals load separate effect files on their stock OS, so they have no image to rebuild or core to boot.
// Erica Synths publishes its firmware source, so mods are built from that source instead of a stock image.
export const FAMILY_STEP_IDS = {
  elektron: ['format', 'rebuild', 'boot', 'core', 'mods'],
  zoom: ['format', 'load', 'mods'],
  erica: ['source', 'boot', 'core', 'mods'],
} as const
export const MACHINE_STEP_IDS = ['format', 'rebuild', 'source', 'boot', 'core', 'load', 'mods'] as const
export const MACHINE_STEP_STATES = ['done', 'started', 'open'] as const
export const MACHINE_PLATFORMS = ['octabam', 'elemod'] as const
export const MACHINE_BODIES = ['compact', 'wide', 'keys', 'box', 'model', 'pedal', 'floor'] as const

export type MachineFamily = typeof MACHINE_FAMILIES[number]
export type MachineStatus = typeof MACHINE_STATUSES[number]
export type MachineStepId = typeof MACHINE_STEP_IDS[number]
export type MachineStepState = typeof MACHINE_STEP_STATES[number]
export type MachinePlatform = typeof MACHINE_PLATFORMS[number]
export type MachineBudget = { name: string; unit: 'bytes' | 'slots' | 'cycles/sample' | 'percent'; value: number; note: string }

export type MachineProfile = {
  schemaVersion: 1
  id: string
  order: number
  name: string
  family: MachineFamily
  variants?: string[]
  status: MachineStatus
  summary: string
  firmware?: {
    releases: { version: string; files: { name: string; sha256: string }[] }[]
    flash: string
    recovery: string
  }
  steps: Partial<Record<MachineStepId, MachineStepState>>
  research?: { label: string; url: string; note: string }[]
  sdk?: {
    platform: MachinePlatform
    modules: string
    catalog: string | null
    guide: string
    core: { version: string; path: string | null } | null
    toolchain: string
    budgets: MachineBudget[]
  }
  art: { body: typeof MACHINE_BODIES[number]; encoders: number; trigs: number; pads?: number; knobs?: number; fader?: boolean }
}

function fail(path: string, message: string): never { throw new Error(path + ': ' + message) }
function object(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
  const item = value as Record<string, unknown>
  for (const key of Object.keys(item)) if (!keys.includes(key) && !optional.includes(key)) fail(path + '.' + key, 'unknown field')
  for (const key of keys) if (!(key in item)) fail(path + '.' + key, 'required field is missing')
  return item
}
function text(value: unknown, path: string, maximum = 400): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value !== value.trim() || Array.from(value).some(character => character.charCodeAt(0) < 32)) fail(path, 'expected trimmed plain text of at most ' + maximum + ' characters')
  return value
}
function choice<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) fail(path, 'expected one of ' + choices.join(', '))
  return value as T
}
function list(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(path, 'expected ' + minimum + '–' + maximum + ' items')
  return value
}
function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(path, 'expected an integer from ' + minimum + ' to ' + maximum)
  return value
}
function repoPath(value: unknown, path: string): string {
  const item = text(value, path, 200)
  if (!/^(sdk|docs)\/[A-Za-z0-9._/-]+$/.test(item) || item.split('/').some(part => part === '..' || part === '.')) fail(path, 'expected a repository path under sdk/ or docs/')
  return item
}
function https(value: unknown, path: string): string {
  const item = text(value, path, 300)
  if (!/^https:\/\/[^\s]+$/.test(item)) fail(path, 'expected an https URL')
  return item
}

export function parseMachineProfile(value: unknown): MachineProfile {
  const item = object(value, 'machine', ['schemaVersion', 'id', 'order', 'name', 'status', 'summary', 'steps', 'art'], ['family', 'variants', 'firmware', 'research', 'sdk'])
  if (item.schemaVersion !== 1) fail('machine.schemaVersion', 'expected 1')
  const id = text(item.id, 'machine.id', 40)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id === 'all') fail('machine.id', 'expected a lowercase kebab-case id other than "all"')
  const status = choice(item.status, 'machine.status', MACHINE_STATUSES)
  const family = item.family === undefined ? 'elektron' : choice(item.family, 'machine.family', MACHINE_FAMILIES)
  const stepIds = FAMILY_STEP_IDS[family]
  const stepsValue = object(item.steps, 'machine.steps', stepIds)
  const steps = Object.fromEntries(stepIds.map(step => [step, choice(stepsValue[step], 'machine.steps.' + step, MACHINE_STEP_STATES)])) as Partial<Record<MachineStepId, MachineStepState>>
  const profile: MachineProfile = {
    schemaVersion: 1, id, order: integer(item.order, 'machine.order', 0, 999), name: text(item.name, 'machine.name', 60), family, status,
    summary: text(item.summary, 'machine.summary', 200), steps, art: parseArt(item.art),
  }
  if (item.variants !== undefined) profile.variants = list(item.variants, 'machine.variants', 1, 6).map((variant, index) => text(variant, 'machine.variants[' + index + ']', 40))
  if (item.firmware !== undefined) profile.firmware = parseFirmware(item.firmware, family)
  if (item.research !== undefined) profile.research = list(item.research, 'machine.research', 1, 12).map((entry, index) => {
    const path = 'machine.research[' + index + ']', research = object(entry, path, ['label', 'url', 'note'])
    return { label: text(research.label, path + '.label', 80), url: https(research.url, path + '.url'), note: text(research.note, path + '.note', 300) }
  })
  if (item.sdk !== undefined) profile.sdk = parseSdk(item.sdk)

  // A machine's status must agree with what it claims: mods need firmware, an SDK and every step done.
  const hasMods = status === 'available' || status === 'preview'
  if (hasMods && (!profile.firmware || !profile.sdk)) fail('machine.status', 'machines with mods need firmware and sdk sections')
  if (hasMods && stepIds.some(step => steps[step] !== 'done')) fail('machine.steps', 'machines with mods have every step done')
  if (!hasMods && steps.mods !== 'open') fail('machine.steps.mods', 'only machines with mods can mark mods done or started')
  if (status === 'research' && !stepIds.some(step => steps[step] !== 'open')) fail('machine.status', 'research needs at least one started step')
  if (status === 'research' && !profile.research) fail('machine.research', 'credit the research the status relies on')
  if (status === 'open' && stepIds.some(step => steps[step] === 'done')) fail('machine.status', 'a machine with finished steps is in research')
  return profile
}

function parseArt(value: unknown): MachineProfile['art'] {
  const art = object(value, 'machine.art', ['body', 'encoders', 'trigs'], ['pads', 'knobs', 'fader'])
  const result: MachineProfile['art'] = { body: choice(art.body, 'machine.art.body', MACHINE_BODIES), encoders: integer(art.encoders, 'machine.art.encoders', 0, 16), trigs: integer(art.trigs, 'machine.art.trigs', 0, 16) }
  if (art.pads !== undefined) result.pads = integer(art.pads, 'machine.art.pads', 1, 16)
  if (art.knobs !== undefined) result.knobs = integer(art.knobs, 'machine.art.knobs', 1, 12)
  if (art.fader !== undefined) { if (typeof art.fader !== 'boolean') fail('machine.art.fader', 'expected true or false'); result.fader = art.fader }
  return result
}

// Elektron releases name their stock OS file and its hash. Zoom ships its OS as an updater app and no mod
// touches it, and Erica Synths builds come from the published source, so their releases list no files:
// only the version the mods were tested on.
function parseFirmware(value: unknown, family: MachineFamily): NonNullable<MachineProfile['firmware']> {
  const firmware = object(value, 'machine.firmware', ['releases', 'flash', 'recovery'])
  const releases = list(firmware.releases, 'machine.firmware.releases', 1, 12).map((entry, index) => {
    const path = 'machine.firmware.releases[' + index + ']', release = object(entry, path, ['version', 'files'])
    return {
      version: text(release.version, path + '.version', 20),
      files: list(release.files, path + '.files', family === 'elektron' ? 1 : 0, family === 'elektron' ? 4 : 0).map((file, fileIndex) => {
        const filePath = path + '.files[' + fileIndex + ']', item = object(file, filePath, ['name', 'sha256'])
        const name = text(item.name, filePath + '.name', 120), sha256 = text(item.sha256, filePath + '.sha256', 64)
        if (!/^[A-Za-z0-9._-]+\.(syx|bin)$/.test(name)) fail(filePath + '.name', 'expected the stock .syx or .bin file name')
        if (!/^[a-f0-9]{64}$/.test(sha256)) fail(filePath + '.sha256', 'expected a SHA-256 identity')
        return { name, sha256 }
      }),
    }
  })
  if (new Set(releases.map(release => release.version)).size !== releases.length) fail('machine.firmware.releases', 'each OS version appears once')
  return { releases, flash: text(firmware.flash, 'machine.firmware.flash'), recovery: text(firmware.recovery, 'machine.firmware.recovery') }
}

function parseSdk(value: unknown): NonNullable<MachineProfile['sdk']> {
  const sdk = object(value, 'machine.sdk', ['platform', 'modules', 'catalog', 'guide', 'core', 'toolchain', 'budgets'])
  let core: NonNullable<MachineProfile['sdk']>['core'] = null
  if (sdk.core !== null) {
    const item = object(sdk.core, 'machine.sdk.core', ['version', 'path'])
    core = { version: text(item.version, 'machine.sdk.core.version', 20), path: item.path === null ? null : repoPath(item.path, 'machine.sdk.core.path') }
  }
  return {
    platform: choice(sdk.platform, 'machine.sdk.platform', MACHINE_PLATFORMS),
    modules: repoPath(sdk.modules, 'machine.sdk.modules'),
    catalog: sdk.catalog === null ? null : repoPath(sdk.catalog, 'machine.sdk.catalog'),
    guide: repoPath(sdk.guide, 'machine.sdk.guide'),
    core,
    toolchain: text(sdk.toolchain, 'machine.sdk.toolchain', 300),
    budgets: list(sdk.budgets, 'machine.sdk.budgets', 1, 12).map((entry, index) => {
      const path = 'machine.sdk.budgets[' + index + ']', budget = object(entry, path, ['name', 'unit', 'value', 'note'])
      return { name: text(budget.name, path + '.name', 60), unit: choice(budget.unit, path + '.unit', ['bytes', 'slots', 'cycles/sample', 'percent'] as const), value: integer(budget.value, path + '.value', 1, 2 ** 40), note: text(budget.note, path + '.note', 300) }
    }),
  }
}
