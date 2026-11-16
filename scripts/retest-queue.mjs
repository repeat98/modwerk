// Which Octatrack modules are due for a re-run on the unit: the USB package that ships differs from what the module's newest
// hardware record ran. A report for the owner and authors to work down; it fails nothing and changes no evidence rule.
//
//   node scripts/retest-queue.mjs     # the table alone; npm run module:doctor -- --all ends with it
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGES = 'src/engine/assets/octatrack-module-packages.json'
export const BASES = 'sdk/machines/octatrack/base-versions.json'

// Every published row of the USB package file, oldest commit first: { id: [{ sha256, version, abi, requiredBase, since, commit }] }
// with each digest once, at the first commit that shipped it. Without Git history (a shallow clone, an export) it is empty.
export function packageHistory(root) {
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] })
  let commits
  try { commits = git(['log', '--reverse', '--format=%H %cs', '--', PACKAGES]).toString('utf8').trim().split('\n').filter(Boolean).map(line => line.split(' ')) } catch { return {} }
  if (!commits.length) return {}
  const out = git(['cat-file', '--batch'], commits.map(([commit]) => commit + ':' + PACKAGES).join('\n') + '\n'), history = {}
  let at = 0
  for (const [commit, since] of commits) {
    const end = out.indexOf(10, at), header = out.subarray(at, end).toString('utf8').split(' ')
    if (header[1] !== 'blob') { at = end + 1; continue }
    const size = Number(header[2]), body = out.subarray(end + 1, end + 1 + size)
    at = end + 1 + size + 1
    let rows
    try { rows = JSON.parse(body.toString('utf8')).packages } catch { continue }
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row?.id || !row.sha256 || history[row.id]?.some(item => item.sha256 === row.sha256)) continue
      ;(history[row.id] ??= []).push({ sha256: row.sha256, version: row.version, abi: row.abi ?? null, requiredBase: row.requiredBase ?? null, since, commit })
    }
  }
  return history
}

const short = sha => sha.slice(0, 8)
export function baseName(identity, bases) {
  if (!identity) return null
  const version = bases.find(base => base.identities.includes(identity))?.version
  return version ? version : short(identity) + ' (no version)'
}

// One row per module whose shipped USB package is not the one its newest hardware record ran. The record says what it ran in two
// places: imageSha256, which is a USB package, a card image or the base image a package was tried on; and its summary, which names
// a package by its first eight hex digits when the image is the base's. Card builds are recognised from the summary ("MAIN OS
// <image>", "card image", "card build") or, when it names no package, from a record older than every published package.
export function retestQueue({ documents, packages, history = {}, bases = [] }) {
  const due = [], unrecorded = []
  for (const document of documents) {
    const tests = document.tests ?? {}, q = tests.qualification, hardware = q?.hardware, shipped = packages.find(row => row.id === document.id)
    if (!['reported', 'verified'].includes(tests.hardwareStatus) || !shipped) continue
    const image = hardware?.imageSha256 ?? (hardware?.kind === 'owner-waived' ? null : q?.imageSha256)
    if (!hardware || hardware.kind === 'owner-waived' || !image) { unrecorded.push(document.id); continue }
    if (image === shipped.sha256) continue
    const summary = hardware.summary ?? '', named = new Set((summary.match(/\b[0-9a-f]{8,64}\b/g) ?? []).map(short))
    const published = history[document.id] ?? [], current = { ...shipped, since: published.find(item => item.sha256 === shipped.sha256)?.since ?? null }
    const ran = published.find(item => item.sha256 === image) ?? published.find(item => named.has(short(item.sha256))) ?? (named.has(short(shipped.sha256)) ? current : null)
    const recordBase = ran?.requiredBase ? baseName(ran.requiredBase, bases) : bases.find(base => base.identities.some(identity => named.has(short(identity))))?.version ?? null
    const row = { id: document.id, version: document.version, testedOn: hardware.testedOn, model: hardware.model ?? null, image: short(image),
      ships: { sha256: short(shipped.sha256), version: shipped.version, abi: shipped.abi ?? null, base: baseName(shipped.requiredBase, bases), since: current.since, lag: shipped.version !== document.version },
      ran: null, recordBase, reason: '', detail: '' }
    const shipsFor = row.ships.base ? 'base ' + row.ships.base : 'any base (abi ' + row.ships.abi + ')'
    if (ran) {
      row.ran = { build: 'usb', sha256: short(ran.sha256), abi: ran.abi, base: baseName(ran.requiredBase, bases) }
      if (ran.sha256 === shipped.sha256) [row.reason, row.detail] = ['base changed', 'ran the shipped package on a development base (record names base image ' + row.image + '); ships for ' + shipsFor]
      else if (ran.abi !== shipped.abi || ran.requiredBase !== (shipped.requiredBase ?? null)) [row.reason, row.detail] = ['base changed', 'package ' + row.ran.sha256 + ' → ' + row.ships.sha256 + ': rebuilt for ' + (ran.abi !== shipped.abi ? 'abi ' + ran.abi + ' → ' + shipped.abi : 'base ' + (row.ran.base ?? 'any') + ' → ' + (row.ships.base ?? 'any'))]
      else [row.reason, row.detail] = ['package changed', 'package ' + row.ran.sha256 + ' → ' + row.ships.sha256 + ', same abi ' + shipped.abi + ' and base pin']
    } else {
      const first = published.map(item => item.since).sort()[0]
      const card = summary.includes('MAIN OS ' + row.image) || /\bcard (image|build)\b/i.test(summary) || (first && hardware.testedOn < first && !/\bpackage\b/i.test(summary))
      row.ran = { build: card ? 'card' : 'usb', sha256: row.image, abi: null, base: recordBase }
      if (card) [row.reason, row.detail] = ['card build', 'ran card image ' + row.image + '; the USB package ' + row.ships.sha256 + ' has no record']
      else [row.reason, row.detail] = ['package changed', 'ran USB build ' + row.image + ', never published; ships ' + row.ships.sha256]
    }
    if (row.ships.lag) row.detail += ' (USB package kept at ' + shipped.version + ' by a declared lag)'
    due.push(row)
  }
  return { due: due.sort((a, b) => a.id.localeCompare(b.id)), unrecorded: unrecorded.sort() }
}

export function formatRetestQueue({ due, unrecorded }, { history = true } = {}) {
  const lines = ['', 'Due for a re-run on the unit (a report: it fails nothing)']
  if (!history) lines.push('  No Git history of ' + PACKAGES + ' here, so a record that ran an earlier package reads as an unpublished build.')
  if (!due.length) lines.push('  none: every module with a hardware record ships the USB package it ran')
  else {
    const cells = due.map(row => [row.id, row.testedOn, (row.ran.build === 'card' ? 'card ' : 'USB ') + row.ran.sha256, row.ships.sha256 + (row.ships.since ? ' since ' + row.ships.since : ''), row.recordBase ?? 'not recorded', row.ships.base ?? 'any', row.reason])
    const head = ['module', 'tested on', 'record ran', 'ships', 'record base', 'ships for base', 'reason'], width = head.map((title, at) => Math.max(title.length, ...cells.map(cell => cell[at].length)))
    const line = cell => '  ' + cell.map((text, at) => at === cell.length - 1 ? text : text.padEnd(width[at])).join('  ')
    lines.push(line(head))
    due.forEach((row, at) => { lines.push(line(cells[at])); lines.push('    ' + row.detail) })
    lines.push('  Run the shipped package (npm run device:qualify) and record it, or say in TESTING.md why the earlier run covers it.')
  }
  if (unrecorded.length) lines.push('  Reported without a hardware record naming an image, so not compared: ' + unrecorded.join(', '))
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('../', import.meta.url))), json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const { parseModuleDocument } = await import('../src/catalog/module-contract.ts')
  const documents = json('sdk/catalog.json').modules.map(item => 'sdk/octatrack/modules/' + item.id + '/octamod.module.json').filter(path => existsSync(resolve(root, path))).map(path => parseModuleDocument(json(path)))
  const history = packageHistory(root)
  console.log(formatRetestQueue(retestQueue({ documents, packages: json(PACKAGES).packages, history, bases: json(BASES).bases }), { history: Object.keys(history).length > 0 }))
}
