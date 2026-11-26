// Every Octatrack module names its CPU price (owner, 16 November 2026): resources.cpuPrice in its octamod.module.json, the value, its
// unit and how it was measured (docs/MODULE_PERFORMANCE.md, "Every module names its CPU price"). A machine's price is also what its
// descriptor carries in reserved[0], the figure the base admits a Part's machines by (machine_registry.c's cpu_price()), so the two
// must agree. Modules listed before the rule wait on one list, sdk/module-cpu-prices-pending.json, which only shrinks.
// A machine may also name the CPU meter it adds (resources.cpuMeter, its descriptor's reserved[1]): the base's busy check charges that
// in place of the price. It is recomputed from the paired readings in its source (CPU_METER_RECORD), never taken on trust.
// npm run modules:check (CI, pr:ready, the doctor's "module rules") refuses what cpuPriceProblems() names; module:doctor shows a line.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const CPU_PRICE_PENDING_PATH = 'sdk/module-cpu-prices-pending.json'
// Only a module first listed before this day can wait on the list; one listed from it names its price before it is listed.
export const CPU_PRICE_PENDING_LISTED_BEFORE = '2026-11-17'
export const CPU_PRICE_PENDING_REASON = 'price not yet measured'
const PORTS = 'sdk/machines/octatrack/module-adapters'
// device:price --write keeps its readings here, in the module's folder; the checks recompute the price from them.
export const CPU_PRICE_RECORD = 'evidence/cpu-price.json'
// A machine's meter readings: { module, pairs: [{ track, flex, machine, flexReadings?, machineReadings?, conditions, source? }] }, percent
// of the CPU meter; readings, when given, are seven 1-second `health` cpu values (per mille) whose middle five give flex and machine.
export const CPU_METER_RECORD = 'evidence/cpu-meter.json'
/** A manifest as device:price --write writes it: two-space JSON, \u-escaped when the text it came from was. */
export function manifestJson(document, originalText) {
  const json = JSON.stringify(document, null, 2) + '\n'
  return /\\u[0-9a-fA-F]{4}/.test(originalText) ? json.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) : json
}
/** A manifest's text as it read before --write gave it a price; null when it names none. */
export function manifestWithoutPrice(text) {
  const document = JSON.parse(text)
  if (!document.resources?.cpuPrice) return null
  delete document.resources.cpuPrice
  return manifestJson(document, text)
}

/** The price a device:price reading gives: the larger of what the module added at rest and in use, never below 0. */
export const measuredPrice = result => Math.max(0, result.atRestAdds.frame, result.inUseAdds?.frame ?? 0)
/** How far a device:price record's own readings agreed, for module:doctor: '' for a record of one reading a state (every record
 * before 24 November 2026), else the count and the widest spread of the frame interrupt's share and of the slot core's DSP peak. */
export function readingsNote(record) {
  if (!(record?.readings > 1)) return ''
  const states = ['before', 'atRest', 'inUse'].map(key => record.result?.[key]?.spread).filter(Boolean)
  const widest = key => { const values = states.map(spread => spread[key]).filter(value => typeof value === 'number'); return values.length ? Math.max(...values) : null }
  const frame = widest('frame'), track = Number(/^T(\d)/.exec(record.result?.inUseOn ?? '')?.[1])
  const peak = track ? widest(track <= 4 ? 'dsp1to4Peak' : 'dsp5to8Peak') : null
  return '; ' + record.readings + ' readings a state' + (frame === null ? '' : ', the frame interrupt within ' + frame + ' points') +
    (peak === null ? '' : ', the ' + (track <= 4 ? 'T1-4' : 'T5-8') + ' DSP peak within ' + peak)
}

/** How to measure the price of a machine (true) or of any other module (false), for the messages. */
export function cpuPriceHowTo(id, machine) {
  return machine
    ? 'measure what one track of it adds to the frame interrupt on a unit with npm run device -- do and guard (a trig on every step, every voice sounding, against the same pattern without those trigs; docs/MODULE_PERFORMANCE.md), then write resources.cpuPrice with "measure": "machine-render" in octamod.module.json and the same percent as reserved[0] of its machine descriptor (docs/MODULE_PERFORMANCE.md)'
    : 'measure it on a unit with npm run device:price -- --write --base ID --scene TEXT ' + id + ' (the frame interrupt\'s share it adds, installed and, for an effect, on one slot; docs/OCTATRACK_DRIVING.md), which writes resources.cpuPrice ("measure": "frame-interrupt") and its readings in ' + CPU_PRICE_RECORD + ' (docs/MODULE_PERFORMANCE.md)'
}

/** The pending list: Map id -> reason. Throws on a list that is not plain. */
export function parseCpuPricePending(text) {
  const document = JSON.parse(text)
  if (!document || typeof document.pending !== 'object' || Array.isArray(document.pending) || !document.pending) throw new Error(CPU_PRICE_PENDING_PATH + ': expected { "about", "pending": { "<module id>": "' + CPU_PRICE_PENDING_REASON + '" } }')
  const pending = new Map()
  for (const [id, reason] of Object.entries(document.pending)) {
    if (reason !== CPU_PRICE_PENDING_REASON) throw new Error(CPU_PRICE_PENDING_PATH + ': ' + id + ' must read "' + CPU_PRICE_PENDING_REASON + '"')
    pending.set(id, reason)
  }
  return pending
}

export function readCpuPricePending(root) {
  const path = resolve(root, CPU_PRICE_PENDING_PATH)
  return existsSync(path) ? parseCpuPricePending(readFileSync(path, 'utf8')) : new Map()
}

const readJson = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null

/** Each port's generated glue unit (machine_ports.py's glue()), by module id: the descriptor a ported machine's package links. */
export function portGlue(root) {
  const script = 'import json, sys\nsys.path.insert(0, sys.argv[1])\nimport machine_ports as m\nprint(json.dumps({n: m.glue(n, e) for n, e in m.ports().items() if e.get("machine")}))'
  const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', script, resolve(root, PORTS)], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0) throw new Error('CPU price: machine_ports.py\'s glue could not be read: ' + (run.stderr || run.error?.message || '').trim().split('\n').pop())
  return JSON.parse(run.stdout)
}

/** reserved[0] of the generated mw_machine record: the byte after source_kind, which follows the .word voice, engine pair. */
export function glueReserved0(glue) { return glueReserved(glue)?.[0] ?? null }
/** reserved[0] and reserved[1] of the generated mw_machine record, or null. */
function glueReserved(glue) {
  const match = /^mw_machine:[\s\S]*?\.word\s+\d+,\s*\d+\s*\n\s*\.byte\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/m.exec(glue)
  return match ? [Number(match[2]), Number(match[3])] : null
}

function sourceFiles(folder, extensions) {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter(name => extensions.test(name) && !name.split(/[\\/]/).includes('upstream')).sort()
}

/** reserved[0] of a C designated initializer `struct modwerk_machine[_setup] SYMBOL = { ... }` in the module's own sources:
 *  { price } (0 when it names none), or { problem }. A literal, or a #define of one, in the same folder. */
export function cReserved0(folder, symbol) {
  const files = sourceFiles(folder, /\.(c|h)$/), texts = files.map(name => [name, readFileSync(join(folder, name), 'utf8')])
  const definition = new RegExp('struct\\s+modwerk_machine(?:_setup)?\\s+' + symbol + '\\s*=\\s*\\{')
  const found = texts.filter(([name, text]) => definition.test(text) && !/(^|[\\/])test_/.test(name))
  if (!found.length) return { problem: 'its machine descriptor ' + symbol + ' is not a C struct modwerk_machine in its folder, so its reserved[0] cannot be read', fix: 'define ' + symbol + ' in C with designated fields (.abi = ..., .reserved = {PERCENT})' }
  const [name, text] = found[0], start = definition.exec(text).index + definition.exec(text)[0].length
  let depth = 1, end = start
  while (end < text.length && depth) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; end++ }
  const body = text.slice(start, end - 1)
  if (!/\.abi\s*=/.test(body)) return { problem: name + ': ' + symbol + ' is not written with designated fields, so its reserved[0] cannot be read', fix: 'write it as { .abi = MODWERK_MACHINE_ABI, ..., .reserved = {PERCENT} }' }
  const list = /\.reserved\s*=\s*\{([^}]*)\}/.exec(body)?.[1].split(',').map(item => item.trim()).filter(Boolean) ?? []
  const single = k => new RegExp('\\.reserved\\s*\\[\\s*' + k + '\\s*\\]\\s*=\\s*([A-Za-z0-9_]+)').exec(body)?.[1]
  const tokens = [list[0] ?? single(0), list[1] ?? single(1)], values = []
  for (const [k, start] of tokens.entries()) {
    if (start === undefined) { values.push(0); continue }
    let token = start
    for (let i = 0; i < 4 && /^[A-Za-z_]\w*$/.test(token); i++) {
      const define = texts.map(([, t]) => new RegExp('^\\s*#\\s*define\\s+' + token + '\\s+\\(?\\s*([A-Za-z0-9_]+)\\s*\\)?\\s*(?:/[*/].*)?$', 'm').exec(t)).find(Boolean)
      if (!define) break
      token = define[1]
    }
    const literal = /^(0x[0-9a-f]+|\d+)u?$/i.exec(token)
    if (!literal) return { problem: name + ': ' + symbol + '\'s reserved[' + k + '] is ' + token + ', which is not a number or a #define of one in its folder', fix: 'write .reserved = {PERCENT} with the measured percent' }
    values.push(Number(literal[1]))
  }
  return { price: values[0], meter: values[1], where: name }
}

/** Every machine descriptor the module contributes to ot_machines, from its runtime*.json, its machine port and its USB package row,
 *  with the reserved[0] each carries: [{ symbol, where, price } | { symbol, problem, fix }]. [] for a module that is not a machine.
 *  A draft (sdk/drafts/<id>, not yet listed) is read from there, so device:price can measure its curve before the release. */
export function machineDescriptors({ root, id, glue = null }) {
  const listed = resolve(root, 'sdk/octatrack/modules', id), draft = resolve(root, 'sdk/drafts', id)
  const folder = existsSync(listed) || !existsSync(draft) ? listed : draft, symbols = new Map()
  for (const name of existsSync(folder) ? readdirSync(folder).filter(name => /^runtime.*\.json$/.test(name)) : []) {
    for (const item of readJson(join(folder, name))?.contribute ?? []) if (item.to === 'ot_machines') symbols.set(item.data, 'c')
  }
  const port = readJson(resolve(root, PORTS, 'machine-ports.json'))?.ports?.[id]
  for (const item of port?.contribute ?? []) if (item.to === 'ot_machines') symbols.set(item.data, port.machine ? 'port' : 'c')
  const row = readJson(resolve(root, 'src/engine/assets/octatrack-module-packages.json'))?.packages?.find(item => item.id === id)
  for (const item of row?.subscribe ?? []) if (typeof item === 'string' && item.startsWith('ot_machines:')) symbols.set(item.split(':')[1], symbols.get(item.split(':')[1]) ?? 'c')
  return [...symbols].map(([symbol, kind]) => {
    if (kind === 'c') return { symbol, ...cReserved0(folder, symbol) }
    const reserved = glueReserved((glue ?? portGlue(root))[id] ?? '')
    return reserved === null
      ? { symbol, problem: 'the descriptor ' + PORTS + '/machine_ports.py generates for it could not be read', fix: 'python3 -B -c "import machine_ports" in ' + PORTS + ' names the error' }
      : { symbol, price: reserved[0], meter: reserved[1], where: PORTS + '/machine-ports.json (generated by machine_ports.py)', port: true }
  })
}

/** One module's price: { state: 'ok' | 'pending' | 'fail', detail, fix? }. */
export function cpuPriceStatus({ root, document, pending, glue = null }) {
  const id = document.id, declared = document.resources.cpuPrice, descriptors = machineDescriptors({ root, id, glue })
  const machine = descriptors.length > 0 || document.compatibility.location === 'Track machine', howTo = cpuPriceHowTo(id, machine)
  const unreadable = descriptors.find(item => item.problem)
  if (unreadable) return { state: 'fail', detail: unreadable.problem, fix: unreadable.fix }
  if (document.compatibility.location === 'Track machine' && !descriptors.length) return { state: 'fail', detail: 'it is a track machine, but no ot_machines descriptor was found in its runtime.json, its machine port or its USB package row', fix: 'contribute its struct modwerk_machine to ot_machines (sdk/machines/octatrack/HOOKS.md)' }
  const priced = descriptors.filter(item => item.price)
  if (pending.has(id)) {
    if (declared) return { state: 'fail', detail: 'it names its price (' + declared.value + ' % of a frame) but is still on the pending list', fix: 'delete its line from ' + CPU_PRICE_PENDING_PATH }
    if (priced.length) return { state: 'fail', detail: priced[0].symbol + ' carries a price (reserved[0] = ' + priced[0].price + ') that octamod.module.json does not name', fix: 'write resources.cpuPrice with that measured price and how it was measured, and delete its line from ' + CPU_PRICE_PENDING_PATH }
    return { state: 'pending', detail: CPU_PRICE_PENDING_REASON + ' (on ' + CPU_PRICE_PENDING_PATH + ', which only shrinks). To name it: ' + howTo }
  }
  if (!declared) return { state: 'fail', detail: 'it names no CPU price (resources.cpuPrice)', fix: howTo }
  if (machine && declared.measure !== 'machine-render') return { state: 'fail', detail: 'it is a machine, so its price is what one playing track adds ("measure": "machine-render"), not ' + declared.measure, fix: howTo }
  if (!machine && declared.measure !== 'frame-interrupt') return { state: 'fail', detail: 'it is not a machine, so its price is the frame interrupt\'s share ("measure": "frame-interrupt"); only a machine\'s descriptor carries a render price', fix: howTo }
  let repeat = ''
  if (declared.source.endsWith('.json')) { // a price device:price wrote: recomputed from its readings, never taken on trust
    const record = readJson(resolve(root, 'sdk/octatrack/modules', id, declared.source))
    repeat = readingsNote(record)
    if (record?.module !== id || !record.result?.atRestAdds) return { state: 'fail', detail: 'its price names ' + declared.source + ' as its source, which holds no device:price reading of ' + id, fix: howTo }
    // Tape Echo 0.1.9 carried the price read on 0.1.6: a release from RELEASE_COST_FROM measures its own.
    const date = releaseDate({ root, document }), logged = existsSync(resolve(root, 'src/community/module-changelogs', id + '.json'))
    if (record.version !== document.version && logged && (!date || date >= RELEASE_COST_FROM))
      return { state: 'fail', detail: 'its price was measured on ' + record.version + ', not ' + document.version + ': a release measures its own cost', fix: howTo }
    if (measuredPrice(record.result) !== declared.value) return { state: 'fail', detail: 'it names ' + declared.value + ' % of a frame, but the reading in ' + declared.source + ' gives ' + measuredPrice(record.result), fix: 'write the price with npm run device:price -- --write, never by hand' }
  }
  const disagree = descriptors.find(item => item.price !== declared.value)
  if (disagree) return {
    state: 'fail',
    detail: 'it names ' + declared.value + ' % of a frame but ' + disagree.symbol + '\'s reserved[0] is ' + disagree.price + ' (' + disagree.where + ')' + (disagree.price ? '' : ', so the base charges its default instead'),
    fix: disagree.port
      ? 'a ported machine\'s descriptor comes from machine_ports.py: write "cpuPrice": ' + declared.value + ' in its entry of ' + PORTS + '/machine-ports.json'
      : 'write .reserved = {' + declared.value + '} in ' + disagree.symbol + ', the same percent as resources.cpuPrice',
  }
  const meter = meterProblem({ root, document, machine, descriptors })
  if (meter) return { state: 'fail', ...meter }
  const what = declared.value + ' % of a frame (' + declared.measure + ', ' + declared.tool + ', ' + declared.date + ')'
  const adds = document.resources.cpuMeter ? '; adds ' + document.resources.cpuMeter.value + ' meter points (reserved[1], ' + document.resources.cpuMeter.date + ')' : ''
  return { state: 'ok', detail: what + repeat + (descriptors.length ? '; ' + descriptors.map(item => item.symbol).join(', ') + ' carries the same in reserved[0]' : '') + adds }
}

/** The meter points a machine adds, recomputed from its paired readings: { added } or { problem }. */
export function measuredMeter(root, id, source) {
  const record = source?.endsWith('.json') ? readJson(resolve(root, 'sdk/octatrack/modules', id, source)) : null
  if (record?.module !== id || !Array.isArray(record.pairs) || !record.pairs.length) return { problem: 'its meter cost names ' + source + ' as its source, which holds no paired meter readings of ' + id + ' (' + CPU_METER_RECORD + ')' }
  const middle = readings => { const kept = [...readings].sort((a, b) => a - b).slice(1, -1); return kept.reduce((a, b) => a + b, 0) / kept.length / 10 }
  let added = -Infinity
  for (const [i, pair] of record.pairs.entries()) {
    for (const side of ['flex', 'machine']) {
      const readings = pair[side + 'Readings']
      if (typeof pair[side] !== 'number') return { problem: source + ': pair ' + (i + 1) + ' has no ' + side + ' figure' }
      if (readings !== undefined && (!Array.isArray(readings) || readings.length !== 7 || Math.abs(middle(readings) - pair[side]) > 0.05))
        return { problem: source + ': pair ' + (i + 1) + '\'s ' + side + ' figure ' + pair[side] + ' is not the middle five of its seven readings' + (Array.isArray(readings) && readings.length === 7 ? ' (' + middle(readings).toFixed(2) + ')' : '') }
    }
    added = Math.max(added, pair.machine - pair.flex)
  }
  return { added }
}

/** A machine's meter cost against its descriptors and its readings, or null when it agrees (or names none and carries none). */
function meterProblem({ root, document, machine, descriptors }) {
  const meter = document.resources.cpuMeter, value = meter?.value ?? 0
  if (meter && !machine) return { detail: 'only a machine names the CPU meter it adds (resources.cpuMeter)', fix: 'delete resources.cpuMeter' }
  const port = descriptors.find(item => item.port)
  // shortcut: machine_ports.py writes reserved[1] as 0, so a ported machine cannot carry a meter cost yet; add "cpuMeter" there when one needs it.
  if (meter && port) return { detail: 'a ported machine cannot name its meter cost yet: machine_ports.py writes reserved[1] as 0', fix: 'delete resources.cpuMeter, or teach machine_ports.py a "cpuMeter" entry' }
  const disagree = descriptors.find(item => (item.meter ?? 0) !== value)
  if (disagree) return {
    detail: meter ? 'it names ' + value + ' meter points but ' + disagree.symbol + '\'s reserved[1] is ' + (disagree.meter ?? 0) + ' (' + disagree.where + ')' : disagree.symbol + '\'s reserved[1] is ' + disagree.meter + ', a meter cost octamod.module.json does not name (resources.cpuMeter)',
    fix: meter ? 'write .reserved = {PRICE, ' + value + '} in ' + disagree.symbol : 'name it in resources.cpuMeter with its readings in ' + CPU_METER_RECORD + ', or write reserved[1] as 0',
  }
  if (!meter) return null
  const measured = measuredMeter(root, document.id, meter.source)
  if (measured.problem) return { detail: measured.problem, fix: 'record each pair of meter readings in ' + CPU_METER_RECORD + ' (docs/MODULE_PERFORMANCE.md)' }
  if (value < Math.ceil(measured.added - 1e-9)) return { detail: 'it names ' + value + ' meter points, but its readings add ' + measured.added.toFixed(2), fix: 'name at least ' + Math.ceil(measured.added - 1e-9) + ' in resources.cpuMeter and reserved[1]' }
  return null
}

/** Every refusal: the list's own rules (only modules listed before CPU_PRICE_PENDING_LISTED_BEFORE, only shrinking against
 *  basePending when the base has the list) and each module's status. documents: the parsed manifests by id. */
export function cpuPriceProblems({ root, documents, catalog, pending, basePending = null, glue = null }) {
  const problems = [], listed = new Map((catalog.modules ?? []).map(item => [item.id, item.addedAt ?? '']))
  for (const id of pending.keys()) {
    if (!documents.has(id)) problems.push(CPU_PRICE_PENDING_PATH + ': ' + id + ' is not a module in sdk/octatrack/modules; delete its line')
    else if (!listed.has(id) || listed.get(id).slice(0, 10) >= CPU_PRICE_PENDING_LISTED_BEFORE) problems.push(CPU_PRICE_PENDING_PATH + ': ' + id + ' was not listed before ' + CPU_PRICE_PENDING_LISTED_BEFORE + ', so it cannot wait: a new module names its CPU price before it is listed. ' + cpuPriceHowTo(id, documents.get(id).compatibility.location === 'Track machine'))
    else if (basePending && !basePending.has(id)) problems.push(CPU_PRICE_PENDING_PATH + ': ' + id + ' is not on the list at the base; the list only shrinks. ' + cpuPriceHowTo(id, documents.get(id).compatibility.location === 'Track machine'))
  }
  let glueUnits = glue
  for (const document of documents.values()) {
    const status = cpuPriceStatus({ root, document, pending, glue: glueUnits ??= lazyGlue(root) })
    if (status.state === 'fail') problems.push(document.id + ': CPU price: ' + status.detail + '. Fix: ' + status.fix)
  }
  return problems
}

// machine_ports.py runs only when a module has a machine port, and once.
function lazyGlue(root) {
  let units = null
  return new Proxy({}, { get: (_, id) => (units ??= portGlue(root))[id] })
}

// ---- What a module costs while nobody uses it (owner, 20 November 2026) ------------------------------------------------------
// An installed module that no track, slot or page uses should cost the frame interrupt nothing: a player with 24 modules paid 6.1
// points for code the interrupt entered while nothing used it (docs/verification/2026-11-20-octatrack-unused-module-cost.md). The
// test procedure's step 9 measures it, and this is the one measure the limit is judged on: `npm run device:price`'s at-rest reading,
// the share of the frame interrupt (`guard`) the module adds while the selected pattern plays, installed and used nowhere, on a
// development twin of a base, against the same scene without it; the reading's base and scene are in its record. A module whose
// figure is above AT_REST_LIMIT must rest: answer
// ev_in_use and mark its frame detours "rests" (sdk/machines/octatrack/HOOKS.md), unless it is a machine, which the base rests itself.
// Both numbers are the owner's to change. Releases dated from AT_REST_FROM (the version's entry in its changelog, or a version with
// none yet) fail; earlier published releases are only warned, so nothing published breaks retroactively.
export const AT_REST_LIMIT = 0.2 // points of the frame interrupt
export const AT_REST_FROM = '2026-11-20' // the day the check merged
const AT_REST_TOLERANCE = 1e-9

/** Whether the module answers ev_in_use itself: its runtime*.json, its machine port or its USB package row subscribes it. */
export function answersInUse({ root, id }) {
  const folder = resolve(root, 'sdk/octatrack/modules', id)
  for (const name of existsSync(folder) ? readdirSync(folder).filter(name => /^runtime.*\.json$/.test(name)) : [])
    if ((readJson(join(folder, name))?.subscribe ?? []).some(item => item.event === 'ev_in_use')) return true
  if ((readJson(resolve(root, PORTS, 'machine-ports.json'))?.ports?.[id]?.subscribe ?? []).some(item => item.event === 'ev_in_use')) return true
  const row = readJson(resolve(root, 'src/engine/assets/octatrack-module-packages.json'))?.packages?.find(item => item.id === id)
  return (row?.subscribe ?? []).some(item => typeof item === 'string' && item.split(':')[0] === 'ev_in_use')
}

/** The figure at rest: device:price's atRestAdds.frame in its record, else the declared price of a module with no effect slot
 *  when device:price took it (installed and used nowhere is all such a module's price measures). null when nothing says: a
 *  machine-render price, or a price some other tool took, is another measure and never judged against the limit. */
export function atRestFigure({ root, document }) {
  const declared = document.resources?.cpuPrice, record = readJson(resolve(root, 'sdk/octatrack/modules', document.id, CPU_PRICE_RECORD))
  if (record?.module === document.id && typeof record.result?.atRestAdds?.frame === 'number') return { value: record.result.atRestAdds.frame, from: CPU_PRICE_RECORD }
  if (declared?.measure === 'frame-interrupt' && /device:price/.test(declared.tool ?? '') && document.compatibility?.effectId == null)
    return { value: declared.value, from: 'resources.cpuPrice' }
  return null
}

/** The date of the module's current version in its changelog (src/community/module-changelogs/<id>.json), or null for none yet. */
export function releaseDate({ root, document }) {
  const entries = readJson(resolve(root, 'src/community/module-changelogs', document.id + '.json'))
  const entry = Array.isArray(entries) ? entries.find(item => item?.version === document.version) : null
  return typeof entry?.date === 'string' ? entry.date.slice(0, 10) : null
}

/** The detours the module marks "rests" (0x addresses): its runtime*.json and its machine port. */
export function declaredRests({ root, id }) {
  const folder = resolve(root, 'sdk/octatrack/modules', id)
  const files = existsSync(folder) ? readdirSync(folder).filter(name => /^runtime.*\.json$/.test(name)) : []
  return [...files.flatMap(name => readJson(join(folder, name))?.rests ?? []),
    ...readJson(resolve(root, PORTS, 'machine-ports.json'))?.ports?.[id]?.rests ?? []]
}
export const declaresRests = args => declaredRests(args).length > 0

/** The sites the module's committed USB package of `version` marks as resting (bit 7 of an ABI 7+ site's length byte, loader.h
 *  RUNTIME_SITE_RESTS), or null while none of that version is committed. What the base reads, not what runtime.json asks for. */
export function packageRests({ root, id, version }) {
  const row = readJson(resolve(root, 'src/engine/assets/octatrack-module-packages.json'))?.packages?.find(item => item.id === id)
  const path = row?.version === version ? resolve(root, 'public', row.path) : null
  if (!path || !existsSync(path)) return null
  const data = readFileSync(path), abi = data.readUInt16BE(4), rests = new Set()
  let at = ({ 7: 72, 8: 76, 9: 80, 10: 80 })[abi] + 4 * data.readUInt32BE(20) + data.readUInt32BE(8) + 4 * data.readUInt32BE(16)
  for (let i = 0; abi >= 7 && i < data.readUInt32BE(24); i++) {
    if (data[at + 4] & 0x80) rests.add(data.readUInt32BE(at))
    at += 40 + (data[at + 4] & 0x7f) + 2 * data[at + 7]
  }
  return rests
}

/** One module's cost at rest: { state: 'ok' | 'info' | 'warn' | 'fail', detail, fix? }. A machine or an effect is answered for by
 *  the base (its handlers rest by themselves), but its own detours rest only where it marks them, so it passes over the limit only
 *  with "rests"; any other module passes over it only by answering ev_in_use. */
export function atRestStatus({ root, document, glue = null }) {
  const id = document.id, figure = atRestFigure({ root, document })
  const machine = machineDescriptors({ root, id, glue }).length > 0 || document.compatibility?.location === 'Track machine'
  const judged = machine || document.compatibility?.effectId != null, measured = figure ? ' (' + figure.value + ' points measured at rest)' : ''
  const built = packageRests({ root, id, version: document.version })
  const unmarked = built ? declaredRests({ root, id }).filter(address => !built.has(Number.parseInt(address, 16))) : []
  if (unmarked.length) return { state: 'fail', detail: 'its USB package ' + document.version + ' does not mark ' + unmarked.join(', ') + ' rests, which runtime.json names',
    fix: 'rebuild it (npm run octatrack:module-packages); a builder route that drops "rests" is a Fix: pull request of its own' }
  if (answersInUse({ root, id })) return { state: 'ok', detail: 'it answers ev_in_use, so it rests while it acts on no track' + measured }
  if (judged && declaresRests({ root, id })) return { state: 'ok', detail: 'the base rests ' + (machine ? 'a machine no track uses' : 'an effect no slot uses') + ', its detours marked rests with it' + measured }
  if (!figure) return { state: 'info', detail: 'no cost at rest measured yet (test procedure step 9, npm run device:price)' }
  if (figure.value <= AT_REST_LIMIT + AT_REST_TOLERANCE) return { state: 'ok', detail: figure.value + ' points of the frame interrupt installed and used nowhere (' + figure.from + '), within ' + AT_REST_LIMIT }
  const date = releaseDate({ root, document }), refused = !date || date >= AT_REST_FROM
  return {
    state: refused ? 'fail' : 'warn',
    detail: 'installed and used nowhere it costs ' + figure.value + ' points of the frame interrupt (' + figure.from + '), more than ' + AT_REST_LIMIT +
      (refused ? '' : '; reported, not refused, for a release dated before ' + AT_REST_FROM),
    fix: (judged
      ? 'list its frame-interrupt detours under "rests" in runtime.json: the base rests ' + (machine ? 'a machine no track uses' : 'an effect no slot uses') + ' and puts stock\'s bytes back there'
      : 'subscribe ev_in_use and answer 0 while it acts on no track, and list its frame-interrupt detours under "rests" in runtime.json') +
      ' (sdk/machines/octatrack/HOOKS.md, docs/MODULE_PERFORMANCE.md "A module that no track uses rests"); then measure again with npm run device:price',
  }
}

// ---- What one more instance costs (owner, 22 November 2026) --------------------------------------------------------------------
// Base 0.8 charges a module pick by its longest-frame curve: `first` for the first instance on a Part, `each` for every further
// one (status.c; the site sends them from sdk/machines/octatrack/frame-costs.json). Every refused pick and every skipped render is
// bad for the player, so a release of an effect or a machine carries its curve, measured on a unit by `npm run device:price --
// --write --curve T1,T3,T6,T7` (empty tracks of a busy pattern), which writes FRAME_COST_RECORD for its version and its line in
// frame-costs.json. Releases dated from FRAME_COST_FROM, or not dated yet, fail without it; earlier ones are only reported.
// Base-bound modules (a USB package row with requiredBase) keep theirs in frame-costs.json, measured by the base's owner.
export const FRAME_COST_RECORD = 'evidence/frame-cost.json'
export const FRAME_COSTS_PATH = 'sdk/machines/octatrack/frame-costs.json' // generated: never by hand
export const FRAME_COSTS_BASE_PATH = 'sdk/machines/octatrack/frame-costs-base.json' // the base's own: base-bound modules and its readings
export const FRAME_COST_FROM = '2026-11-23' // the day after base 0.8's curves were first measured
// What a curve must also show (owner, 23 November 2026: every refused pick, silent module, stall and crash costs the player, so a
// release proves on a unit that it is admitted and plays). FM Synth 0.1.5's first curve reading sat at 107.9 % of a frame, past
// where the guard drops renders, and no step had ever checked that a module is admitted on an empty and a medium pattern.
export const RELEASE_COST_FROM = '2026-11-24'
export const CURVE_ROOM = 100 // percent of a frame: the first instance's reading must stay under it
/** Why a current-version curve does not carry a release, or null: its first reading past CURVE_ROOM, or no clean admission run. */
export function curveProblem(record) {
  const reading = Array.isArray(record.points) ? record.points[1] : undefined
  if (typeof reading !== 'number') return 'its curve holds no readings (points), so nothing shows the frame had room'
  if (!(reading < CURVE_ROOM)) return 'its first instance was read at ' + reading + ' % of a frame: past ' + CURVE_ROOM + ' % the guard drops renders, so that is the overload, not the module\'s cost. Read it on a pattern with room (--measure-pattern)'
  const runs = Array.isArray(record.admission) ? record.admission : []
  for (const pattern of ['empty', 'medium']) {
    const run = runs.find(item => item?.pattern === pattern)
    if (!run) return 'no admission run on the ' + pattern + ' pattern (device:price --curve makes it)'
    if (run.admitted !== true) return 'alone on the ' + pattern + ' pattern it was ' + (run.admitted === false ? 'refused' : 'not verified') + (run.why ? ' (' + run.why + ')' : '')
    if (run.dropped !== 0 || run.stalls !== 0) return 'alone on the ' + pattern + ' pattern it dropped ' + run.dropped + ' renders and logged ' + run.stalls + ' stalls or crashes in ' + (run.seconds ?? '?') + ' s'
  }
  return null
}
/** The owner's approval of this exact version lists "release-cost" in `waived`: a module too heavy for the medium pattern
 *  (Grain, POLY8) can still ship an update. It excuses only curveProblem, never a curve read on another version. Only for a
 *  module without its own qualification record: that is when modules:check validates the approval in full, source hash included. */
export function releaseCostWaived({ root, document }) {
  if (document.tests?.qualification || document.tests?.releaseWaiver) return false
  const approval = readJson(resolve(root, 'sdk/approvals', document.id + '-build-approval.json'))
  return approval?.kind === 'owner-approved-update' && approval.approvedBy === 'repeat98' && approval.id === document.id &&
    approval.version === document.version && Array.isArray(approval.waived) && approval.waived.includes('release-cost')
}
export const frameCostHowTo = id => 'measure it on a unit with npm run device:price -- --write --curve T1,T3,T6,T7 --base ID --scene TEXT ' + id +
  ' (the longest frame it adds on 1-4 empty tracks of a busy pattern, picked on an empty one; docs/MODULE_PERFORMANCE.md), which writes ' + FRAME_COST_RECORD + ' (npm run modules:generate then carries it into ' + FRAME_COSTS_PATH + ')'

/** One module's instance curve: { state: 'ok' | 'info' | 'warn' | 'fail', detail, fix? }. */
export function frameCostStatus({ root, document, glue = null }) {
  const id = document.id, machine = machineDescriptors({ root, id, glue }).length > 0 || document.compatibility?.location === 'Track machine'
  if (!machine && document.compatibility?.effectId == null) return { state: 'info', detail: 'neither an effect nor a machine: admission charges it no instance cost' }
  const row = readJson(resolve(root, 'src/engine/assets/octatrack-module-packages.json'))?.packages?.find(item => item.id === id)
  if (row?.requiredBase) return { state: 'info', detail: 'base-bound: its curve is the base\'s, in sdk/machines/octatrack/frame-costs.json' }
  const record = readJson(resolve(root, 'sdk/octatrack/modules', id, FRAME_COST_RECORD))
  const valid = record?.module === id && typeof record.first === 'number' && typeof record.each === 'number' && record.first >= record.each && record.each >= 0 &&
    (record.rest == null || (typeof record.rest === 'number' && record.rest >= 0))
  // A module with no changelog file predates the release notes (a legacy fixture): reported. One whose current version has no
  // entry yet is a release in progress, and one dated from FRAME_COST_FROM a new release: both refused.
  const logged = existsSync(resolve(root, 'src/community/module-changelogs', id + '.json')), date = releaseDate({ root, document })
  const refused = logged && (!date || date >= FRAME_COST_FROM)
  if (valid && record.version === document.version) {
    const detail = 'first ' + record.first + ', each ' + record.each + (record.rest != null ? ', rest ' + record.rest : '') + ' % of a frame (' + record.base + ', ' + String(record.measuredAt).slice(0, 10) + ')'
    const problem = curveProblem(record)
    if (!problem) return { state: 'ok', detail: detail + '; admitted alone on the empty and the medium pattern, nothing dropped' }
    const strict = logged && (!date || date >= RELEASE_COST_FROM)
    if (strict && releaseCostWaived({ root, document })) return { state: 'ok', detail: detail + '; ' + problem + ' (waived by the owner for this version: sdk/approvals/' + id + '-build-approval.json)' }
    return strict ? { state: 'fail', detail: problem, fix: frameCostHowTo(id) }
      : { state: 'ok', detail: detail + '; ' + problem + ' (reported, not refused, for a release dated before ' + RELEASE_COST_FROM + ')' }
  }
  return { state: refused ? 'fail' : 'warn', detail: (valid ? 'its curve is for ' + record.version + ', not ' + document.version : 'no instance curve measured') +
    (refused ? '' : '; reported, not refused, for a release dated before ' + FRAME_COST_FROM), fix: frameCostHowTo(id) }
}

/** frame-costs.json's text: `about`, then `costs` one module a line, sorted, as a diff reads best. */
export function frameCostsJson(document) {
  const lines = Object.keys(document.costs).sort().map(key => '    ' + JSON.stringify(key) + ': ' + JSON.stringify(document.costs[key]))
  const stock = document.stock ? '  "stock": ' + JSON.stringify(document.stock) + ',\n' : ''
  return '{\n  "about": ' + JSON.stringify(document.about) + ',\n' + stock + '  "costs": {\n' + lines.join(',\n') + '\n  }\n}\n'
}
/** The table admission charges (the site sends it with every module set): the base's own list, and every module's measured curve
 *  for its current version on top (its FRAME_COST_RECORD). Generated by npm run modules:generate, so module releases never
 *  conflict over one shared file. */
export function generateFrameCosts(root) {
  const base = readJson(resolve(root, FRAME_COSTS_BASE_PATH))
  if (!base) return null // no Octatrack frame-cost table in this tree (a fixture): nothing to generate
  const costs = { ...base.costs }
  const modules = resolve(root, 'sdk/octatrack/modules')
  for (const id of existsSync(modules) ? readdirSync(modules) : []) {
    const version = readJson(join(modules, id, 'octamod.module.json'))?.version, record = readJson(join(modules, id, FRAME_COST_RECORD))
    if (!version || record?.module !== id || record.version !== version || typeof record.first !== 'number' || typeof record.each !== 'number') continue
    costs[id] = { first: record.first, each: record.each, ...(typeof record.rest === 'number' ? { rest: record.rest } : {}), points: record.adds,
      measured: id + ' ' + version + ' on ' + (record.tracks ?? []).join(' ') + ': ' + record.scene + '; base ' + record.base + '; ' + record.seconds + ' s a reading; ' + String(record.measuredAt).slice(0, 10) + ' (' + FRAME_COST_RECORD + ')' }
  }
  return frameCostsJson({ about: 'GENERATED by npm run modules:generate from ' + FRAME_COSTS_BASE_PATH + ' and each module\'s ' + FRAME_COST_RECORD + ': never edit by hand. ' + base.about, ...(base.stock ? { stock: base.stock } : {}), costs })
}
