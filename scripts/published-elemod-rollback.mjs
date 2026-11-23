// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { LINK_DEVICES } from '../src/engine/elektron/elemod.ts'
import { assembleCatalog, readVendoredElekloader } from './elekloader-vendor.ts'

const runsUrl = 'https://api.github.com/repos/repeat98/modwerk/actions/workflows/pages.yml/runs?branch=main&status=success&per_page=1'
const catalogUrl = 'https://modwerk.app/elekloader/catalog.json'

async function loadJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error('Could not verify the published release at ' + url + ' (HTTP ' + response.status + ')')
  return response.json()
}

async function releaseCommit() {
  const { workflow_runs } = await loadJson(runsUrl)
  const run = workflow_runs?.[0]
  if (run?.repository?.full_name !== 'repeat98/modwerk' || run.path !== '.github/workflows/pages.yml'
    || run.head_branch !== 'main' || run.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(run.head_sha))
    throw new Error('Could not identify the last successful production Pages release')
  return run.head_sha
}

export function publishedElemodRollback(root, baseCommit) {
  let release, publishedCatalog
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  return async (document, folder) => {
    release ??= Promise.all([releaseCommit(), loadJson(catalogUrl), readVendoredElekloader(root)])
    const [published, live, local] = await release
    git('merge-base', '--is-ancestor', published, baseCommit)
    const path = folder + 'modwerk.module.json'
    const id = document.machine + '-' + document.id
    const paths = [folder, 'src/community/module-changelogs/' + id + '.json']
    if (!git('ls-tree', '--name-only', published, '--', path).trim()
      || JSON.parse(git('show', published + ':' + path)).version !== document.version
      || git('diff', '--name-only', '--no-ext-diff', published, '--', ...paths)
      || git('ls-files', '--others', '--exclude-standard', '--', ...paths))
      throw new Error(id + ': a rollback must restore the module files from the last successful production release')

    const device = LINK_DEVICES.find(item => item.machine === document.machine)?.key
    const pins = catalog => catalog.mods.filter(pin => pin.id === document.id && pin.device === device)
      .sort((a, b) => a.file.localeCompare(b.file))
    // A published module page and its downloadable package can have different versions.
    // Recover the package records served by the same deployment that supplied the source.
    publishedCatalog ??= assembleCatalog(file => git('show', published + ':' + file),
      git('ls-tree', '--name-only', '-r', published, '--', 'sdk/imports').trimEnd().split('\n')).catalog
    const expected = pins(publishedCatalog)
    if (!device || !expected.length || !isDeepStrictEqual(pins(live), expected)
      || !isDeepStrictEqual(pins(local.catalog), expected))
      throw new Error(id + ': a rollback must restore every package pinned by the last release and the live catalog')
  }
}
