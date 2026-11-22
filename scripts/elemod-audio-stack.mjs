// SPDX-License-Identifier: GPL-3.0-or-later
// The audio interrupt's stack: a machine whose audio interrupt runs on the stack of whichever task it arrived in
// (sdk/machines/<machine>/audio-stack.json) refuses a module whose audio code could need more than that machine's
// limit. The compiler writes each C object's frames and calls (-fstack-usage, -fcallgraph-info=su, which leave the
// object unchanged); this sums them from every entry the base calls in the audio interrupt: the handlers of the
// listed events, and the listed function fields of the records the module contributes to the listed tables.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readElemodElf } from './elemod-elf.mjs'

export const AUDIO_STACK_FLAGS = ['-fstack-usage', '-fcallgraph-info=su']
const RETURN_ADDRESS = 4                                 // a jsr's push on the 68k
const STT_FUNC = 2, STT_SECTION = 3

export function loadAudioStack(root, machineId) {
  const path = resolve(root, 'sdk/machines', machineId, 'audio-stack.json')
  if (!existsSync(path)) return null
  const config = JSON.parse(readFileSync(path, 'utf8'))
  if (!Number.isInteger(config.limit) || config.limit < 64 || !Array.isArray(config.events) || typeof config.tables !== 'object')
    throw new Error(path + ': expected {limit, events, tables}')
  return { ...config, path }
}

// The byte offset of each listed field in its record, measured by the compiler from the machine's own headers.
export function fieldOffsets(config, { run, work, includes, cflags }) {
  const fields = Object.entries(config.tables).flatMap(([table, t]) => t.fields.map(field => ({ table, struct: t.struct, field })))
  if (!fields.length) return {}
  const headers = [...new Set(Object.values(config.tables).map(t => t.header))]
  const source = resolve(work, 'audio-stack-offsets.c'), object = source + '.o'
  const text = ['#include <stddef.h>', ...headers.map(h => '#include "' + h + '"'),
    'const unsigned audio_stack_offsets[] = {', ...fields.map(f => '    offsetof(struct ' + f.struct + ', ' + f.field + '),'), '};', '']
  writeFileSync(source, text.join('\n'))
  run('gcc', [...cflags, ...includes, '-c', source, '-o', object])
  const elf = readElemodElf(readFileSync(object))
  const symbol = elf.symbols.find(s => s.name === 'audio_stack_offsets')
  const data = elf.sections[symbol.section].data
  const offsets = {}
  fields.forEach((f, i) => { (offsets[f.table] ??= {})[f.field] = data.readUInt32BE(symbol.value + 4 * i) })
  return offsets
}


// The call graph GCC writes (VCG): a node's title is "file:name" for a static function, "name" otherwise.
export function parseCallgraph(text, graph = { nodes: new Map(), edges: new Map() }) {
  for (const m of text.matchAll(/node: \{ title: "([^"]+)" label: "([^"]*)"/g)) {
    const [, title, label] = m, lines = label.split('\\n')
    const usage = lines.map(l => l.match(/^(\d+) bytes \(([a-z,]+)\)$/)).find(Boolean)
    if (usage) graph.nodes.set(title, { name: lines[0], bytes: Number(usage[1]), qualifier: usage[2] })
    else if (!graph.nodes.has(title)) graph.nodes.set(title, { name: lines[0], bytes: null, qualifier: 'external' })
  }
  for (const m of text.matchAll(/edge: \{ sourcename: "([^"]+)" targetname: "([^"]+)"/g)) {
    if (!graph.edges.has(m[1])) graph.edges.set(m[1], new Set())
    graph.edges.get(m[1]).add(m[2])
  }
  return graph
}

// The deepest stack from a function: its frame, then for each call a return address and the callee's deepest.
export function deepest(graph, title, seen = new Map(), path = []) {
  if (seen.has(title)) return seen.get(title)
  if (path.includes(title)) throw new Error('recursion in audio code: ' + [...path, title].map(t => graph.nodes.get(t)?.name ?? t).join(' -> '))
  // A call by name binds as the linker binds it: to a weak C definition only when no object defines the name
  // strongly (GCC titles a weak definition with its file, the call with the name); never to another file's static.
  const alias = graph.aliases?.get(title)
  if (alias && alias !== title) return deepest(graph, alias, seen, path)
  const node = graph.nodes.get(title)
  if (!node || node.bytes === null) {
    // Outside this module's C (assembly, a base or stock routine, an indirect call): not counted here.
    const result = { bytes: 0, chain: [], unknown: [node?.name ?? title] }
    seen.set(title, result)
    return result
  }
  if (node.qualifier === 'dynamic') throw new Error(node.name + ' sizes its stack at run time (a variable-length array or alloca): not allowed in audio code')
  let best = { bytes: 0, chain: [] }, unknown = []
  for (const callee of graph.edges.get(title) ?? []) {
    const below = deepest(graph, callee, seen, [...path, title])
    unknown.push(...below.unknown)
    if (RETURN_ADDRESS + below.bytes > best.bytes) best = { bytes: RETURN_ADDRESS + below.bytes, chain: below.chain }
  }
  const result = { bytes: node.bytes + best.bytes, chain: [node.name + ' ' + node.bytes + ' B', ...best.chain], unknown: [...new Set(unknown)] }
  seen.set(title, result)
  return result
}

const STB_GLOBAL = 1, STB_WEAK = 2
const byName = s => s.bind === STB_GLOBAL || s.bind === STB_WEAK
const defines = name => s => s.name === name && s.type === STT_FUNC && s.section !== 0

// A function in this module's objects, as the call graph titles it (a global's name; a static's or a weak's prefixed
// with its source, as GCC writes them); { external } when the definition the linker picks is not C. By name (no
// source), it binds as the linker does: a global definition, else the first weak one, else the only static one.
function resolveFunction(elves, name, source) {
  const external = { name, title: name, external: true }
  if (source) {
    const o = elves.find(o => o.source === source && o.elf.symbols.some(defines(name)))
    return o?.c ? { name, title: source + ':' + name } : external
  }
  const strong = elves.find(o => o.elf.symbols.some(s => defines(name)(s) && s.bind === STB_GLOBAL))
  if (strong) return strong.c ? { name, title: name } : external
  const weak = elves.find(o => o.elf.symbols.some(s => defines(name)(s) && s.bind === STB_WEAK))
  if (weak) return weak.c ? { name, title: weak.source + ':' + name } : external
  const local = elves.filter(o => o.c && o.elf.symbols.some(defines(name)))
  if (local.length > 1) throw new Error('audio entry ' + name + ' is defined in more than one source; give it one definition')
  return local.length ? { name, title: local[0].source + ':' + name } : external
}

// Each name a weak C definition serves, when no object defines it strongly: the call's title to the definition's.
function weakAliases(elves) {
  const aliases = new Map()
  for (const o of elves) for (const s of o.elf.symbols)
    if (s.bind === STB_WEAK && defines(s.name)(s) && !aliases.has(s.name)) {
      const r = resolveFunction(elves, s.name, null)
      if (!r.external && r.title !== s.name) aliases.set(s.name, r.title)
    }
  return aliases
}

// The function a record's field points at: the relocation at that field, to a function symbol, to its section plus
// the function's offset, or to a name another object defines.
function fieldFunction(elves, o, at) {
  const reloc = o.elf.relocs.find(r => r.section === at.section && r.offset === at.offset)
  if (!reloc) return null
  const { symbol } = reloc
  if (symbol.type === STT_SECTION) {
    const fn = o.elf.symbols.find(s => s.type === STT_FUNC && s.section === symbol.section && s.value === reloc.addend)
    if (!fn) throw new Error('a record field points into ' + o.source + ' but at no function')
    return resolveFunction(elves, fn.name, byName(fn) ? null : o.source)
  }
  if (symbol.section !== 0 && !byName(symbol)) return resolveFunction(elves, symbol.name, o.source)
  return resolveFunction(elves, symbol.name, null)
}

// objects: [{ source (as given to the compiler), object, callgraph, c }]: every object of the module, C or assembly.
const readObjects = objects => objects.map(o => ({ ...o, elf: readElemodElf(readFileSync(o.object)) }))

export function audioEntries(config, offsets, build, objects, elves = readObjects(objects)) {
  const entries = []
  for (const sub of build.subscribe) if (config.events.includes(sub.event)) entries.push({ what: sub.event + ' ' + sub.fn, ...resolveFunction(elves, sub.fn, null) })
  for (const entry of build.contribute) {
    const table = config.tables[entry.to]
    if (!table) continue
    for (const [, , to, addend] of entry.relocs) {
      const [kind, name] = [to.slice(0, 4), to.slice(4)]
      const records = elves.flatMap(o => {
        if (kind === 'sym:') return o.elf.symbols.filter(s => s.name === name && s.section !== 0 && s.type !== STT_SECTION && s.type !== STT_FUNC).map(s => ({ o, section: s.section, base: s.value }))
        if (kind === 'sec:') return o.elf.sections.filter(sec => sec.name === name).map(sec => ({ o, section: sec.index, base: 0 }))
        return []
      })
      if (!records.length) throw new Error('the record ' + to + ' contributed to ' + entry.to + ' is not in the module\'s objects')
      for (const { o, section, base } of records)
        for (const field of table.fields) {
          const fn = fieldFunction(elves, o, { section, offset: base + (addend ?? 0) + offsets[entry.to][field] })
          if (fn) entries.push({ what: entry.to + ' ' + name + (addend ? '+' + addend : '') + '.' + field, ...fn })
        }
    }
  }
  return entries
}

export function checkAudioStack({ config, offsets, build, objects, label }) {
  const elves = readObjects(objects)
  const graph = { nodes: new Map(), edges: new Map(), aliases: weakAliases(elves) }
  for (const o of objects.filter(o => o.c)) {
    if (!existsSync(o.callgraph)) throw new Error(label + ': the compiler wrote no call graph for ' + o.source)
    parseCallgraph(readFileSync(o.callgraph, 'utf8'), graph)
  }
  const results = []
  for (const entry of audioEntries(config, offsets, build, objects, elves)) {
    if (!entry.external && graph.nodes.get(entry.title)?.bytes == null)
      throw new Error(label + ': ' + entry.what + ' is in C but its frame is not in the call graph (' + entry.title + ')')
    const r = deepest(graph, entry.title)
    results.push({ ...entry, ...r })
    if (r.bytes > config.limit) throw new Error(label + ': ' + entry.what + ' runs in the audio interrupt and needs ' + r.bytes + ' B of stack (' + r.chain.join(' -> ') + '), over the ' + config.limit + ' B this machine allows (' + config.path.replace(/^.*\/sdk\//, 'sdk/') + '). The interrupt runs on the stack of whichever task it arrived in: put buffers and large locals in static memory.')
  }
  return results
}
