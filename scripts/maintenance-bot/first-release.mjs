// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Inspect PR objects as data from a checkout of trusted main. Never run or check out module code here.
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual as equal } from 'node:util'
import { parseAuthorRegistry } from '../../src/release/author-updates.ts'

const registry = '.github/module-authors.json'
const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function requireScope(ok, message) { if (!ok) throw new Error(message) }

function oneNewRow(before, after, field, id) {
  const rows = after[field].filter(row => row.id === id)
  requireScope(rows.length === 1 && !before[field].some(row => row.id === id) &&
    equal(before, { ...after, [field]: after[field].filter(row => row.id !== id) }), 'Only the new module row may change in ' + field)
  return rows[0]
}

export function inspectFirstRelease(root, base, head, author, reviewer) {
  requireScope([head, base].every(sha => /^[a-f0-9]{40}$/.test(sha)), 'Expected exact commits')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
  git('merge-base', '--is-ancestor', base, head)
  const json = (ref, path) => JSON.parse(git('show', ref + ':' + path))
  const paths = git('diff', '--no-renames', '--name-only', '-z', base, head).split('\0').filter(Boolean)
  const manifest = paths.filter(path => /^sdk\/[a-z0-9-]+\/modules\/[a-z0-9-]+\/(octamod|modwerk)\.module\.json$/.test(path))
  requireScope(manifest.length === 1, 'Expected one new module')
  const path = manifest[0], folder = path.slice(0, path.lastIndexOf('/')), doc = json(head, path)
  const octatrack = path.endsWith('/octamod.module.json'), machine = octatrack ? 'octatrack' : doc.machine, id = doc.id
  requireScope(typeof id === 'string' && safeId.test(id) && typeof machine === 'string' && safeId.test(machine) &&
    !git('ls-tree', base, '--', folder), 'Expected a new module folder')
  const profile = json(base, 'sdk/machines/' + machine + '/machine.json')
  requireScope(profile.id === machine && folder === profile.sdk?.modules + '/' + id, 'Module is outside its device folder')
  requireScope(profile.deviceReviewers?.includes(reviewer.id), 'Reviewer is not assigned to ' + machine)
  const login = author.login.toLowerCase()
  requireScope(author.type === 'User' && Number.isSafeInteger(author.id) && author.id > 0 && doc.author?.github?.toLowerCase() === login, 'The submitting GitHub user must be the module author')
  const owners = [doc.author.github, ...(doc.maintainers ?? []), ...(doc.author.contributors ?? []).map(person => person.github)]
  requireScope(author.id !== reviewer.id && !owners.some(name => name.toLowerCase() === reviewer.login.toLowerCase()), 'A reviewer cannot approve their own module')
  requireScope(!doc.tests?.releaseWaiver && doc.tests?.qualification?.hardware?.kind !== 'owner-waived', 'Waivers need owner review')

  const accounts = parseAuthorRegistry(json(base, registry)).accounts
  const nextAccounts = parseAuthorRegistry(json(head, registry)).accounts
  requireScope((!Object.hasOwn(accounts, login) || accounts[login] === author.id) &&
    !Object.entries(accounts).some(([name, id]) => name !== login && id === author.id) &&
    equal(nextAccounts, { ...accounts, [login]: author.id }), 'Register only the submitting modder with their numeric GitHub ID')

  const key = octatrack ? id : machine + '-' + id
  const allowed = new Set([registry, 'src/community/module-changelogs/' + key + '.json'])
  const added = new Set(git('diff', '--no-renames', '--diff-filter=A', '--name-only', '-z', base, head).split('\0').filter(Boolean))
  requireScope(added.has('src/community/module-changelogs/' + key + '.json'), 'First release requires new release notes')
  // Git modes are part of the diff. A link, submodule, or mode change cannot borrow an allowed filename.
  const diff = git('diff', '--raw', '-z', '--no-renames', base, head).trimEnd().split('\0')
  for (let i = 0; i < diff.length - 1; i += 2) {
    const [oldMode, mode] = diff[i].slice(1).split(' ')
    requireScope(['100644', '100755', '000000'].includes(mode) && ['100644','100755','000000'].includes(oldMode) &&
      (mode === '000000' || oldMode === '000000' || mode === oldMode), 'Only regular module files may change')
  }

  if (octatrack) {
    for (const [file, field] of [['sdk/catalog.json', 'modules'], ['src/catalog/module-documents.json', 'modules'], ['src/engine/assets/octatrack-module-packages.json', 'packages']]) {
      const row = oneNewRow(json(base, file), json(head, file), field, id)
      requireScope(row.version === doc.version, 'Release versions must match')
      allowed.add(file)
      if (field === 'packages') {
        const binary = 'public/octatrack-modules/' + id + '/' + doc.version + '.mwrm'
        requireScope('public/' + row.path === binary && added.has(binary), 'Expected a new module package')
        allowed.add(binary)
      }
    }
  }
  const fxIds = 'sdk/machines/' + machine + '/fx-ids.json'
  if (paths.includes(fxIds)) {
    const before = json(base, fxIds), after = json(head, fxIds)
    const slots = Object.keys(after.ids).filter(slot => !Object.hasOwn(before.ids, slot))
    requireScope(slots.length === 1 && /^[1-9]\d?$/.test(slots[0]) && Number(slots[0]) <= 63 && after.ids[slots[0]] === id &&
      !Object.values(before.ids).includes(id) && equal(after, { ...before, ids: { ...before.ids, [slots[0]]: id } }), 'Only the new effect id may be assigned')
    allowed.add(fxIds)
  }
  const deviceKey = machine === 'digitakt' || machine === 'digitone' ? machine + '-mk1' : machine.replace(/-(?:mk)?ii$/, '-mk2').replace(/-mki$/, '-mk1')
  for (const file of paths.filter(path => /^sdk\/imports\/[a-z0-9.-]+\.json$/.test(path))) {
    requireScope(added.has(file), 'Existing import records cannot change')
    const record = json(head, file)
    if (file.startsWith('sdk/imports/elekloader-')) {
      requireScope(profile.sdk.platform === 'elemod' && record.cores?.length === 0 && record.mods?.length > 0, 'Expected a module package record')
      for (const pin of record.mods) {
        requireScope(pin.id === id && pin.device === deviceKey && [doc.version, doc.version.split('-')[0]].includes(pin.version) &&
          /^[a-zA-Z0-9._-]+\.elemod$/.test(pin.file), 'Package belongs to another module, device or version')
        const served = 'vendor/elekloader/catalog/' + pin.file
        requireScope(added.has(served), 'A first release must ship its own new package')
        const artifact = json(head, served)
        requireScope(artifact.id === id && artifact.target?.device === deviceKey && artifact.version === pin.version, 'Package identity differs from its pin')
        for (const target of ['vendor/elekloader/catalog/' + pin.file, 'sdk/imports/packages/' + id + '/' + pin.file]) {
          if (paths.includes(target)) { requireScope(added.has(target), 'Existing packages cannot change'); allowed.add(target) }
        }
      }
    } else {
      requireScope(record.module === machine + '/' + id || (octatrack && equal(record.modules, [id]) && record.files?.every(f => f.path.startsWith('modules/' + id + '/'))), 'Import must name only this module')
    }
    allowed.add(file)
  }
  if (profile.sdk.platform === 'zdl' && /^[a-z0-9._-]+\.zdl$/i.test(doc.platform?.file)) {
    const binary = 'public/zoom-effects/' + id + '/' + doc.version + '/' + doc.platform.file
    requireScope(added.has(binary), 'Expected a new ZDL binary')
    allowed.add(binary)
  }
  for (const file of paths) {
    if (file.startsWith(folder + '/') || allowed.has(file)) continue
    // An Octatrack draft can be removed when its own finished module moves into the library.
    if (octatrack && file.startsWith('sdk/drafts/' + id + '/') && !git('ls-tree', head, '--', file)) continue
    throw new Error('Outside the first release: ' + file)
  }
  return { machine, module: key, registered: !Object.hasOwn(accounts, login) }
}
