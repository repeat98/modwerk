import { compareModuleVersions } from './versions.ts'
import type { MachineProfile } from '../devices/machine-contract.ts'

// Module contract v3 (modwerk.module.json): one shared core for every machine, plus the machine's platform section.
// Octatrack modules keep contract v2 (octamod.module.json) until their next version; this file adds the shared core and
// the elemod platform used by the Digitakt and Digitone. No source is executed and no firmware is read.

export const MODULE_V3_CATEGORIES = ['effects', 'playback', 'machines', 'scenes', 'midi-usb', 'system', 'standalone'] as const
export const EVIDENCE_TIERS = ['none', 'emulator', 'author-hardware', 'owner-verified'] as const
export const EVIDENCE_METHODS = ['unmeasured', 'static', 'emulator', 'hardware'] as const
export type EvidenceTier = typeof EVIDENCE_TIERS[number]
export type EvidenceMethod = typeof EVIDENCE_METHODS[number]

export type ElemodPlatform = { kind: 'elemod'; core: string; build: string; events: string[]; claims: string[] }
export type ModwerkModule = {
  schemaVersion: 3
  id: string; name: string; version: string; machine: string; category: typeof MODULE_V3_CATEGORIES[number]
  // Standalone firmware replaces the whole OS image: it is exclusive and never combines with other modules.
  exclusive: boolean
  author: { github: string; name?: string; credits: string[] }
  maintainers: string[]
  source?: { repository: string; revision: string; path: string }
  presentation: { label: string; family: string; summary: string; overview: string; highlights: string[]; usage: string[] }
  access: { location: string; steps: string[]; screenshots: string[] } | { noUiReason: string }
  controls: { name: string; default: number | null; doc: string; labels: string[] | null }[]
  compatibility: { releases: string[]; requires: string[]; conflicts: string[]; limitations: string[] }
  platform: ElemodPlatform
  resources: { memoryBytes: number | null; fastBytes: number | null; load: { display: string; method: EvidenceMethod; conditions: string } }
  evidence: {
    tier: EvidenceTier; moduleVersion: string; sourceSha256: string | null; reports: string[]
    hardware: { model: string; release: string; testedOn: string; tester: string; durationMinutes: number | null; summary: string; limitations: string[] } | null
    verifiedBy: string | null
  }
  tests: { report: string; summary: string }
  license: { spdx: string; file: string; declaration: string }
  media: { path: string; kind: 'thumbnail' | 'screenshot' | 'audio'; caption: string; alt: string; credit: string; license: string; source: string; capture?: { release: string; moduleVersion: string; imageSha256: string; setup: string }; otUi?: { page: string; shows: 'location' | 'controls' | 'location-and-controls'; firmware: string; moduleVersion: string; imageSha256: string; setup: string } }[]
}

function fail(path: string, message: string): never { throw new Error(path + ': ' + message) }
function object(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
  const item = value as Record<string, unknown>
  for (const key of Object.keys(item)) if (!keys.includes(key) && !optional.includes(key)) fail(path + '.' + key, 'unknown field')
  for (const key of keys) if (!(key in item)) fail(path + '.' + key, 'required field is missing')
  return item
}
function text(value: unknown, path: string, maximum = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || Array.from(value).some(character => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)))) fail(path, 'expected nonempty plain text within ' + maximum + ' characters')
  return value.trim()
}
function choice<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) fail(path, 'expected one of ' + choices.join(', '))
  return value as T
}
function list(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(path, 'expected ' + minimum + '–' + maximum + ' items')
  return value
}
function texts(value: unknown, path: string, minimum: number, maximum: number, length = 4000): string[] { return list(value, path, minimum, maximum).map((item, index) => text(item, path + '[' + index + ']', length)) }
function count(value: unknown, path: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, 'expected a non-negative integer or null')
  return value
}
function login(value: unknown, path: string): string {
  const item = text(value, path, 39)
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(item)) fail(path, 'expected a GitHub login')
  return item
}
function sha256(value: unknown, path: string): string {
  const item = text(value, path, 64)
  if (!/^[a-f0-9]{64}$/.test(item)) fail(path, 'expected a SHA-256 identity')
  return item
}
// Module-relative paths only: no parent directories, no absolute paths and no firmware or executables.
export function modulePath(value: unknown, path: string): string {
  const item = text(value, path, 200)
  if (item.startsWith('/') || item.includes('\\') || item.split('/').some(part => !part || part === '.' || part === '..')) fail(path, 'expected a path inside the module folder')
  if (/\.(bin|syx|elemod|exe|dll|so|dylib|zip|img|hex)$/i.test(item)) fail(path, 'firmware, build outputs and binaries are not accepted in module folders')
  return item
}
// Core versions are short release numbers such as 2.1 or 2.2a.
function coreVersion(value: unknown, path: string): string {
  const item = text(value, path, 20)
  if (!/^\d+(\.\d+){0,2}[a-z]?$/.test(item)) fail(path, 'expected a core release such as 2.1')
  return item
}
export function compareCoreVersions(a: string, b: string) {
  const parts = (value: string) => value.match(/\d+/g)!.map(Number)
  const left = parts(a), right = parts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index++) if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0)
  return a.localeCompare(b)
}
function version(value: unknown, path: string): string {
  const item = text(value, path, 80)
  try { compareModuleVersions(item, item) } catch { fail(path, 'expected a semantic version') }
  return item
}

export function parseModwerkModule(value: unknown, machines: readonly MachineProfile[]): ModwerkModule {
  const item = object(value, 'module', ['schemaVersion', 'id', 'name', 'version', 'machine', 'category', 'exclusive', 'author', 'maintainers', 'presentation', 'access', 'controls', 'compatibility', 'platform', 'resources', 'evidence', 'tests', 'license', 'media'], ['source'])
  if (item.schemaVersion !== 3) fail('module.schemaVersion', 'expected 3')
  const id = text(item.id, 'module.id', 60)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail('module.id', 'expected lowercase kebab-case')
  const machine = machines.find(profile => profile.id === item.machine)
  if (!machine) fail('module.machine', 'expected a machine from sdk/machines')
  if (machine.sdk?.platform !== 'elemod') fail('module.machine', machine.name + ' modules use its own platform contract (' + (machine.sdk?.platform ?? 'no SDK yet') + ')')
  const moduleVersion = version(item.version, 'module.version')

  const authorValue = object(item.author, 'module.author', ['github', 'credits'], ['name'])
  const author: ModwerkModule['author'] = { github: login(authorValue.github, 'module.author.github'), credits: texts(authorValue.credits, 'module.author.credits', 1, 20, 300) }
  if (authorValue.name !== undefined) author.name = text(authorValue.name, 'module.author.name', 80)
  const maintainers = list(item.maintainers, 'module.maintainers', 1, 10).map((entry, index) => login(entry, 'module.maintainers[' + index + ']'))
  if (!maintainers.includes(author.github)) fail('module.maintainers', 'include the author, who maintains the module until they hand it over')
  if (new Set(maintainers).size !== maintainers.length) fail('module.maintainers', 'list each maintainer once')

  const presentationValue = object(item.presentation, 'module.presentation', ['label', 'family', 'summary', 'overview', 'highlights', 'usage'])
  const presentation = {
    label: text(presentationValue.label, 'module.presentation.label', 40), family: text(presentationValue.family, 'module.presentation.family', 40),
    summary: text(presentationValue.summary, 'module.presentation.summary', 240), overview: text(presentationValue.overview, 'module.presentation.overview'),
    highlights: texts(presentationValue.highlights, 'module.presentation.highlights', 1, 8, 200), usage: texts(presentationValue.usage, 'module.presentation.usage', 1, 8, 300),
  }

  const accessValue = item.access as Record<string, unknown> | null
  const access: ModwerkModule['access'] = accessValue && typeof accessValue === 'object' && 'noUiReason' in accessValue
    ? { noUiReason: text(object(accessValue, 'module.access', ['noUiReason']).noUiReason, 'module.access.noUiReason', 400) }
    : (() => { const value = object(item.access, 'module.access', ['location', 'steps', 'screenshots']); return { location: text(value.location, 'module.access.location', 200), steps: texts(value.steps, 'module.access.steps', 1, 12, 300), screenshots: list(value.screenshots, 'module.access.screenshots', 0, 8).map((path, index) => modulePath(path, 'module.access.screenshots[' + index + ']')) } })()

  const controls = list(item.controls, 'module.controls', 0, 64).map((entry, index) => {
    const path = 'module.controls[' + index + ']', control = object(entry, path, ['name', 'default', 'doc', 'labels'])
    if (control.default !== null && (typeof control.default !== 'number' || !Number.isFinite(control.default))) fail(path + '.default', 'expected a number or null')
    return { name: text(control.name, path + '.name', 40), default: control.default as number | null, doc: text(control.doc, path + '.doc', 600), labels: control.labels === null ? null : texts(control.labels, path + '.labels', 1, 128, 40) }
  })

  const compatibilityValue = object(item.compatibility, 'module.compatibility', ['releases', 'requires', 'conflicts', 'limitations'])
  const supported = machine.firmware?.releases.map(release => release.version) ?? []
  const releases = texts(compatibilityValue.releases, 'module.compatibility.releases', 1, 12, 20)
  for (const release of releases) if (!supported.includes(release)) fail('module.compatibility.releases', release + ' is not a ' + machine.name + ' OS release in its machine profile')
  const compatibility = { releases, requires: texts(compatibilityValue.requires, 'module.compatibility.requires', 0, 20, 60), conflicts: texts(compatibilityValue.conflicts, 'module.compatibility.conflicts', 0, 20, 60), limitations: texts(compatibilityValue.limitations, 'module.compatibility.limitations', 0, 20, 400) }

  const platformValue = object(item.platform, 'module.platform', ['kind', 'core', 'build', 'events', 'claims'])
  if (platformValue.kind !== 'elemod') fail('module.platform.kind', 'expected elemod')
  const core = coreVersion(platformValue.core, 'module.platform.core')
  if (machine.sdk.core && /^\d/.test(machine.sdk.core.version) && compareCoreVersions(core, machine.sdk.core.version) > 0) fail('module.platform.core', 'needs core ' + core + ', newer than the machine’s core ' + machine.sdk.core.version)
  const platform: ElemodPlatform = { kind: 'elemod', core, build: modulePath(platformValue.build, 'module.platform.build'), events: texts(platformValue.events, 'module.platform.events', 0, 16, 40), claims: texts(platformValue.claims, 'module.platform.claims', 0, 32, 80) }
  for (const event of platform.events) if (!/^ev_[a-z_]+$/.test(event)) fail('module.platform.events', 'expected core event names such as ev_draw')

  const resourcesValue = object(item.resources, 'module.resources', ['memoryBytes', 'fastBytes', 'load'])
  const loadValue = object(resourcesValue.load, 'module.resources.load', ['display', 'method', 'conditions'])
  const resources = { memoryBytes: count(resourcesValue.memoryBytes, 'module.resources.memoryBytes'), fastBytes: count(resourcesValue.fastBytes, 'module.resources.fastBytes'), load: { display: text(loadValue.display, 'module.resources.load.display', 120), method: choice(loadValue.method, 'module.resources.load.method', EVIDENCE_METHODS), conditions: text(loadValue.conditions, 'module.resources.load.conditions', 600) } }
  for (const [field, name] of [['memoryBytes', 'Shared mod memory'], ['fastBytes', 'Fast SRAM for code']] as const) {
    const budget = machine.sdk.budgets.find(entry => entry.name === name), value = resources[field]
    if (budget && value !== null && value > budget.value) fail('module.resources.' + field, value + ' bytes exceed the ' + machine.name + ' budget of ' + budget.value)
  }

  const evidence = parseEvidence(item.evidence, moduleVersion)
  const testsValue = object(item.tests, 'module.tests', ['report', 'summary'])
  const tests = { report: modulePath(testsValue.report, 'module.tests.report'), summary: text(testsValue.summary, 'module.tests.summary', 600) }
  const licenseValue = object(item.license, 'module.license', ['spdx', 'file', 'declaration'])
  const license = { spdx: text(licenseValue.spdx, 'module.license.spdx', 120), file: modulePath(licenseValue.file, 'module.license.file'), declaration: text(licenseValue.declaration, 'module.license.declaration', 600) }

  const media = list(item.media, 'module.media', 1, 24).map((entry, index) => {
    const path = 'module.media[' + index + ']', value = object(entry, path, ['path', 'kind', 'caption', 'alt', 'credit', 'license', 'source'], ['capture', 'otUi'])
    const result: ModwerkModule['media'][number] = { path: modulePath(value.path, path + '.path'), kind: choice(value.kind, path + '.kind', ['thumbnail', 'screenshot', 'audio'] as const), caption: text(value.caption, path + '.caption', 200), alt: text(value.alt, path + '.alt', 300), credit: text(value.credit, path + '.credit', 200), license: text(value.license, path + '.license', 120), source: text(value.source, path + '.source', 300) }
    if (value.capture !== undefined) {
      const capture = object(value.capture, path + '.capture', ['release', 'moduleVersion', 'imageSha256', 'setup'])
      const release = text(capture.release, path + '.capture.release', 20)
      if (!supported.includes(release)) fail(path + '.capture.release', 'expected a supported OS release')
      result.capture = { release, moduleVersion: version(capture.moduleVersion, path + '.capture.moduleVersion'), imageSha256: sha256(capture.imageSha256, path + '.capture.imageSha256'), setup: text(capture.setup, path + '.capture.setup', 600) }
    }
    if (value.otUi !== undefined) {
      const ui = object(value.otUi, path + '.otUi', ['page', 'shows', 'firmware', 'moduleVersion', 'imageSha256', 'setup'])
      result.otUi = { page: text(ui.page, path + '.otUi.page', 120), shows: choice(ui.shows, path + '.otUi.shows', ['location', 'controls', 'location-and-controls'] as const), firmware: text(ui.firmware, path + '.otUi.firmware', 20), moduleVersion: version(ui.moduleVersion, path + '.otUi.moduleVersion'), imageSha256: sha256(ui.imageSha256, path + '.otUi.imageSha256'), setup: text(ui.setup, path + '.otUi.setup', 600) }
      if (result.kind !== 'screenshot' || !result.capture) fail(path + '.otUi', 'UI evidence must be a versioned screenshot')
      if (result.otUi.firmware !== result.capture.release || result.otUi.moduleVersion !== result.capture.moduleVersion || result.otUi.imageSha256 !== result.capture.imageSha256 || result.otUi.setup !== result.capture.setup) fail(path + '.otUi', 'UI provenance must match the screenshot capture')
    }
    if (result.kind === 'screenshot' && !result.capture) fail(path + '.capture', 'screenshots record the OS release, module version, image and setup they show')
    return result
  })
  if (!media.some(entry => entry.kind === 'thumbnail')) fail('module.media', 'include an original thumbnail')
  if ('screenshots' in access) for (const screenshot of access.screenshots) if (!media.some(entry => entry.path === screenshot && entry.kind === 'screenshot')) fail('module.access.screenshots', screenshot + ' must be declared as a screenshot in media')

  const document: ModwerkModule = {
    schemaVersion: 3, id, name: text(item.name, 'module.name', 60), version: moduleVersion, machine: machine.id, category: choice(item.category, 'module.category', MODULE_V3_CATEGORIES), exclusive: item.exclusive as boolean,
    author, maintainers, presentation, access, controls, compatibility, platform, resources, evidence, tests, license, media,
  }
  if (typeof item.exclusive !== 'boolean') fail('module.exclusive', 'expected true or false')
  if (item.exclusive !== (document.category === 'standalone')) fail('module.exclusive', 'standalone firmware, and only standalone firmware, is exclusive')
  if (document.exclusive && (platform.events.length || platform.claims.length)) fail('module.platform', 'standalone firmware does not link with the core: leave events and claims empty')
  if (item.source !== undefined) {
    const source = object(item.source, 'module.source', ['repository', 'revision', 'path'])
    const repository = text(source.repository, 'module.source.repository', 200), revision = text(source.revision, 'module.source.revision', 40)
    if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) fail('module.source.repository', 'expected a GitHub repository URL')
    if (!/^[a-f0-9]{40}$/.test(revision)) fail('module.source.revision', 'pin an exact 40-character commit')
    document.source = { repository, revision, path: text(source.path, 'module.source.path', 200) }
  }
  return document
}

function parseEvidence(value: unknown, moduleVersion: string): ModwerkModule['evidence'] {
  const item = object(value, 'module.evidence', ['tier', 'moduleVersion', 'sourceSha256', 'reports', 'hardware', 'verifiedBy'])
  const tier = choice(item.tier, 'module.evidence.tier', EVIDENCE_TIERS)
  const evidence: ModwerkModule['evidence'] = {
    tier, moduleVersion: version(item.moduleVersion, 'module.evidence.moduleVersion'),
    sourceSha256: item.sourceSha256 === null ? null : sha256(item.sourceSha256, 'module.evidence.sourceSha256'),
    reports: list(item.reports, 'module.evidence.reports', 0, 12).map((path, index) => modulePath(path, 'module.evidence.reports[' + index + ']')),
    hardware: null, verifiedBy: item.verifiedBy === null ? null : login(item.verifiedBy, 'module.evidence.verifiedBy'),
  }
  if (item.hardware !== null) {
    const hardware = object(item.hardware, 'module.evidence.hardware', ['model', 'release', 'testedOn', 'tester', 'durationMinutes', 'summary', 'limitations'])
    const testedOn = text(hardware.testedOn, 'module.evidence.hardware.testedOn', 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(testedOn)) fail('module.evidence.hardware.testedOn', 'expected YYYY-MM-DD')
    evidence.hardware = { model: text(hardware.model, 'module.evidence.hardware.model', 60), release: text(hardware.release, 'module.evidence.hardware.release', 20), testedOn, tester: text(hardware.tester, 'module.evidence.hardware.tester', 80), durationMinutes: count(hardware.durationMinutes, 'module.evidence.hardware.durationMinutes'), summary: text(hardware.summary, 'module.evidence.hardware.summary', 1200), limitations: texts(hardware.limitations, 'module.evidence.hardware.limitations', 0, 20, 400) }
  }
  // Each tier claims exactly what it shows: evidence beyond "none" belongs to this version and its source.
  if (tier === 'none' && (evidence.hardware || evidence.verifiedBy)) fail('module.evidence.tier', 'raise the tier to record hardware or owner verification')
  if (tier !== 'none') {
    if (evidence.moduleVersion !== moduleVersion) fail('module.evidence.moduleVersion', 'evidence must be for this module version')
    if (!evidence.sourceSha256) fail('module.evidence.sourceSha256', 'bind the evidence to the tested source')
    if (!evidence.reports.length) fail('module.evidence.reports', 'include the text reports behind the tier')
  }
  if ((tier === 'author-hardware' || tier === 'owner-verified') && !evidence.hardware) fail('module.evidence.hardware', 'hardware tiers need the hardware report')
  if (tier === 'owner-verified' && !evidence.verifiedBy) fail('module.evidence.verifiedBy', 'name the owner who verified the actual report')
  if (tier !== 'owner-verified' && evidence.verifiedBy) fail('module.evidence.verifiedBy', 'only owner-verified evidence names a verifier')
  return evidence
}

// Tiered release gate: published versions measure their memory and load and carry the author's hardware report.
export function requireModwerkPublication(document: ModwerkModule) {
  if (document.resources.memoryBytes === null) fail(document.id + '.resources.memoryBytes', 'measure the module’s memory before publication')
  if (document.resources.load.method === 'unmeasured') fail(document.id + '.resources.load.method', 'measure the audio and CPU load before publication')
  if (EVIDENCE_TIERS.indexOf(document.evidence.tier) < EVIDENCE_TIERS.indexOf('author-hardware')) fail(document.id + '.evidence.tier', 'publication needs at least author-hardware evidence')
  if ('screenshots' in document.access && !document.access.screenshots.length) fail(document.id + '.access.screenshots', 'publication needs actual screenshots of where the mod appears')
}

// The elemod build spec (build.json): what Modwerk's toolchain compiles and links. Stock bytes never appear here:
// each patch site names its address, length and the SHA-256 of the stock bytes it expects in the owner's own file.
export const ELEMOD_SITE_OPS = ['jmp', 'jsr', 'keep2', 'ptr'] as const
export type ElemodSite = { addr: string; len: number; stockSha256: string; op: typeof ELEMOD_SITE_OPS[number]; target: string }
export type ElemodRelease = { defsym: Record<string, string>; cflags: string[]; sites: ElemodSite[] }
export type ElemodBuildSpec = {
  strings: Record<string, string>
  schemaVersion: 1; sources: string[]; defsym: Record<string, string>; cflags: string[]; weak: string[]
  subscribe: { event: string; fn: string; order: number }[]
  contribute: { to: string; order: number; data: string; relocs: [number, 'abs32' | 'pc32' | 'pc16', string, number][] }[]
  collections: Record<string, number>; copied: { lo: string; hi: string; to: string }[]; regions: { name: string; lo: string; hi: string }[]
  claims: string[]; requires: string[]
  // Steps that need the stock OS run only during the owner's local build, never in CI.
  derive: { kind: string; note: string; release: string; releases: string[]; block: [string, string]; sram: [string, string]; callSites: { addr: string; len: number; stockSha256: string; target: string }[] } | null
  releases: Record<string, ElemodRelease>
}
const symbol = (value: unknown, path: string) => { const item = text(value, path, 80); if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item)) fail(path, 'expected a C symbol'); return item }
const address = (value: unknown, path: string) => { const item = text(value, path, 10); if (!/^0x[0-9a-f]{8}$/.test(item)) fail(path, 'expected a 32-bit address such as 0x4000a770'); return item }
const hexBytes = (value: unknown, path: string) => { const item = text(value, path, 512); if (!/^([0-9a-f]{2})+$/.test(item)) fail(path, 'expected the module’s own bytes as lowercase hex'); return item }
function defines(value: unknown, path: string): Record<string, string> {
  const item = object(value, path, Object.keys((value ?? {}) as object))
  return Object.fromEntries(Object.entries(item).map(([key, entry]) => [symbol(key, path + '.' + key), text(String(entry), path + '.' + key, 40)]))
}
function sites(value: unknown, path: string): ElemodSite[] {
  return list(value, path, 0, 256).map((entry, index) => {
    const at = path + '[' + index + ']', site = object(entry, at, ['addr', 'len', 'stockSha256', 'op', 'target'])
    const len = count(site.len, at + '.len')
    if (!len || len > 64) fail(at + '.len', 'expected 1–64 bytes')
    return { addr: address(site.addr, at + '.addr'), len, stockSha256: sha256(site.stockSha256, at + '.stockSha256'), op: choice(site.op, at + '.op', ELEMOD_SITE_OPS), target: symbol(site.target, at + '.target') }
  })
}
function range(value: unknown, path: string): [string, string] {
  const pair = list(value, path, 2, 2), lo = address(pair[0], path + '[0]'), hi = address(pair[1], path + '[1]')
  if (parseInt(lo, 16) >= parseInt(hi, 16)) fail(path, 'expected a start below its end')
  return [lo, hi]
}

export function parseElemodBuild(value: unknown, document: Pick<ModwerkModule, 'platform' | 'compatibility'>): ElemodBuildSpec {
  const keys = ['schemaVersion', 'sources', 'defsym', 'cflags', 'weak', 'subscribe', 'contribute', 'collections', 'copied', 'regions', 'claims', 'requires', 'derive', 'releases'] as const
  const item = object(value, 'build', keys, ['strings'])
  if (item.schemaVersion !== 1) fail('build.schemaVersion', 'expected 1')
  const sources = list(item.sources, 'build.sources', 1, 64).map((path, index) => {
    const file = modulePath(path, 'build.sources[' + index + ']')
    if (!/^src\/.+\.(c|s|S)$/.test(file)) fail('build.sources[' + index + ']', 'expected C or assembly under src/')
    return file
  })
  const subscribe = list(item.subscribe, 'build.subscribe', 0, 32).map((entry, index) => {
    const at = 'build.subscribe[' + index + ']', value = object(entry, at, ['event', 'fn', 'order'])
    const event = text(value.event, at + '.event', 40)
    if (!/^ev_[a-z_]+$/.test(event)) fail(at + '.event', 'expected a core event such as ev_draw')
    return { event, fn: symbol(value.fn, at + '.fn'), order: count(value.order, at + '.order') ?? 0 }
  })
  const contribute = list(item.contribute, 'build.contribute', 0, 32).map((entry, index) => {
    const at = 'build.contribute[' + index + ']', value = object(entry, at, ['to', 'order', 'data', 'relocs'])
    const relocs = list(value.relocs, at + '.relocs', 0, 32).map((reloc, r) => {
      const parts = list(reloc, at + '.relocs[' + r + ']', 4, 4)
      return [count(parts[0], at + '.relocs[' + r + '][0]') ?? 0, choice(parts[1], at + '.relocs[' + r + '][1]', ['abs32', 'pc32', 'pc16'] as const), text(parts[2], at + '.relocs[' + r + '][2]', 80), typeof parts[3] === 'number' && Number.isSafeInteger(parts[3]) ? parts[3] : fail(at + '.relocs[' + r + '][3]', 'expected an integer addend')] as [number, 'abs32' | 'pc32' | 'pc16', string, number]
    })
    return { to: symbol(value.to, at + '.to'), order: count(value.order, at + '.order') ?? 0, data: hexBytes(value.data, at + '.data'), relocs }
  })
  const collectionsValue = object(item.collections, 'build.collections', Object.keys((item.collections ?? {}) as object))
  const collections = Object.fromEntries(Object.entries(collectionsValue).map(([name, entry]) => [symbol(name, 'build.collections.' + name), count(entry, 'build.collections.' + name) ?? 0]))
  const copied = list(item.copied, 'build.copied', 0, 8).map((entry, index) => { const at = 'build.copied[' + index + ']', value = object(entry, at, ['lo', 'hi', 'to']); const [lo, hi] = range([value.lo, value.hi], at); return { lo, hi, to: address(value.to, at + '.to') } })
  const regions = list(item.regions, 'build.regions', 0, 8).map((entry, index) => { const at = 'build.regions[' + index + ']', value = object(entry, at, ['name', 'lo', 'hi']); const [lo, hi] = range([value.lo, value.hi], at); return { name: text(value.name, at + '.name', 80), lo, hi } })
  const claims = texts(item.claims, 'build.claims', 0, 32, 80)
  if ([...claims].sort().join('\n') !== [...document.platform.claims].sort().join('\n')) fail('build.claims', 'must match module.platform.claims')
  const events = new Set([...subscribe.map(entry => entry.event), ...contribute.map(entry => entry.to).filter(name => name.startsWith('ev_'))])
  if ([...events].sort().join('\n') !== [...document.platform.events].sort().join('\n')) fail('build.subscribe', 'the events the build subscribes to must match module.platform.events')
  const requires = texts(item.requires, 'build.requires', 0, 16, 60)
  for (const id of requires) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail('build.requires', 'expected module ids')
  let derive: ElemodBuildSpec['derive'] = null
  if (item.derive !== null) {
    const value = object(item.derive, 'build.derive', ['kind', 'note', 'release', 'block', 'sram', 'callSites'], ['releases'])
    derive = {
      kind: symbol(value.kind, 'build.derive.kind'), note: text(value.note, 'build.derive.note', 600), release: text(value.release, 'build.derive.release', 20),
      releases: texts(value.releases ?? [value.release], 'build.derive.releases', 1, 16, 20),
      block: range(value.block, 'build.derive.block'), sram: range(value.sram, 'build.derive.sram'),
      callSites: list(value.callSites, 'build.derive.callSites', 0, 64).map((entry, index) => { const at = 'build.derive.callSites[' + index + ']', site = object(entry, at, ['addr', 'len', 'stockSha256', 'target']); return { addr: address(site.addr, at + '.addr'), len: count(site.len, at + '.len') ?? 0, stockSha256: sha256(site.stockSha256, at + '.stockSha256'), target: address(site.target, at + '.target') } }),
    }
  }
  const releasesValue = object(item.releases, 'build.releases', document.compatibility.releases)
  const releases = Object.fromEntries(document.compatibility.releases.map(release => {
    const at = 'build.releases.' + release, value = object(releasesValue[release], at, ['defsym', 'cflags', 'sites'])
    return [release, { defsym: defines(value.defsym, at + '.defsym'), cflags: texts(value.cflags, at + '.cflags', 0, 16, 60), sites: sites(value.sites, at + '.sites') }]
  }))
  if (derive && !document.compatibility.releases.includes(derive.release)) fail('build.derive.release', 'expected a supported release')
  if (derive && (derive.releases.some(release => !document.compatibility.releases.includes(release)) || !derive.releases.includes(derive.release))) fail('build.derive.releases', 'expected supported releases including the base release')
  const stringsValue = object(item.strings ?? {}, 'build.strings', Object.keys((item.strings ?? {}) as object))
  const strings = Object.fromEntries(Object.entries(stringsValue).map(([name, value]) => [symbol(name, 'build.strings.' + name), text(value, 'build.strings.' + name, 120)]))
  return { schemaVersion: 1, sources, strings, defsym: defines(item.defsym, 'build.defsym'), cflags: texts(item.cflags, 'build.cflags', 0, 16, 60), weak: list(item.weak, 'build.weak', 0, 16).map((name, index) => symbol(name, 'build.weak[' + index + ']')), subscribe, contribute, collections, copied, regions, claims, requires, derive, releases }
}
