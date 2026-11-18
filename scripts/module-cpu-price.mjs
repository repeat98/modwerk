// Every Octatrack module names its CPU price (owner, 16 November 2026): resources.cpuPrice in its octamod.module.json, the value, its
// unit and how it was measured (docs/MODULE_PERFORMANCE.md, "Every module names its CPU price"). A machine's price is also what its
// descriptor carries in reserved[0], the figure the base admits a Part's machines by (machine_registry.c's cpu_price()), so the two
// must agree. Modules listed before the rule wait on one list, sdk/module-cpu-prices-pending.json, which only shrinks.
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
export function glueReserved0(glue) {
  const match = /^mw_machine:[\s\S]*?\.word\s+\d+,\s*\d+\s*\n\s*\.byte\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/m.exec(glue)
  return match ? Number(match[2]) : null
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
  const match = /\.reserved\s*=\s*\{\s*([A-Za-z0-9_]+)|\.reserved\s*\[\s*0\s*\]\s*=\s*([A-Za-z0-9_]+)/.exec(body)
  if (!match) return { price: 0, where: name }
  let token = match[1] ?? match[2]
  for (let i = 0; i < 4 && /^[A-Za-z_]\w*$/.test(token); i++) {
    const define = texts.map(([, t]) => new RegExp('^\\s*#\\s*define\\s+' + token + '\\s+\\(?\\s*([A-Za-z0-9_]+)\\s*\\)?\\s*(?:/[*/].*)?$', 'm').exec(t)).find(Boolean)
    if (!define) break
    token = define[1]
  }
  const literal = /^(0x[0-9a-f]+|\d+)u?$/i.exec(token)
  if (!literal) return { problem: name + ': ' + symbol + '\'s reserved[0] is ' + token + ', which is not a number or a #define of one in its folder', fix: 'write .reserved = {PERCENT} with the measured percent' }
  return { price: Number(literal[1]), where: name }
}

/** Every machine descriptor the module contributes to ot_machines, from its runtime*.json, its machine port and its USB package row,
 *  with the reserved[0] each carries: [{ symbol, where, price } | { symbol, problem, fix }]. [] for a module that is not a machine. */
export function machineDescriptors({ root, id, glue = null }) {
  const folder = resolve(root, 'sdk/octatrack/modules', id), symbols = new Map()
  for (const name of existsSync(folder) ? readdirSync(folder).filter(name => /^runtime.*\.json$/.test(name)) : []) {
    for (const item of readJson(join(folder, name))?.contribute ?? []) if (item.to === 'ot_machines') symbols.set(item.data, 'c')
  }
  const port = readJson(resolve(root, PORTS, 'machine-ports.json'))?.ports?.[id]
  for (const item of port?.contribute ?? []) if (item.to === 'ot_machines') symbols.set(item.data, port.machine ? 'port' : 'c')
  const row = readJson(resolve(root, 'src/engine/assets/octatrack-module-packages.json'))?.packages?.find(item => item.id === id)
  for (const item of row?.subscribe ?? []) if (typeof item === 'string' && item.startsWith('ot_machines:')) symbols.set(item.split(':')[1], symbols.get(item.split(':')[1]) ?? 'c')
  return [...symbols].map(([symbol, kind]) => {
    if (kind === 'c') return { symbol, ...cReserved0(folder, symbol) }
    const price = glueReserved0((glue ?? portGlue(root))[id] ?? '')
    return price === null
      ? { symbol, problem: 'the descriptor ' + PORTS + '/machine_ports.py generates for it could not be read', fix: 'python3 -B -c "import machine_ports" in ' + PORTS + ' names the error' }
      : { symbol, price, where: PORTS + '/machine-ports.json (generated by machine_ports.py)', port: true }
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
  if (declared.source.endsWith('.json')) { // a price device:price wrote: recomputed from its readings, never taken on trust
    const record = readJson(resolve(root, 'sdk/octatrack/modules', id, declared.source))
    if (record?.module !== id || !record.result?.atRestAdds) return { state: 'fail', detail: 'its price names ' + declared.source + ' as its source, which holds no device:price reading of ' + id, fix: howTo }
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
  const what = declared.value + ' % of a frame (' + declared.measure + ', ' + declared.tool + ', ' + declared.date + ')'
  return { state: 'ok', detail: what + (descriptors.length ? '; ' + descriptors.map(item => item.symbol).join(', ') + ' carries the same in reserved[0]' : '') }
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
