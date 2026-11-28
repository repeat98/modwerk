import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseAuthorRegistry } from './author-updates'

// #1541: every published module's primary author can release their own updates, ports included.
describe('author registry', () => {
  // shortcut: Octatrack only (sdk/catalog.json); other machines have no published list to read yet, so their authors stay owner-registered.
  it('registers the primary author of every Octatrack module in the catalog', () => {
    const registered = new Set(Object.keys(parseAuthorRegistry(JSON.parse(readFileSync('.github/module-authors.json', 'utf8'))).accounts).map(login => login.toLowerCase()))
    const catalog = new Set((JSON.parse(readFileSync('sdk/catalog.json', 'utf8')).modules as { id: string }[]).map(module => module.id))
    const manifests = execFileSync('git', ['ls-files', 'sdk/octatrack/modules/*/octamod.module.json'], { encoding: 'utf8' }).trim().split('\n')
    const missing = manifests.flatMap(path => {
      const manifest = JSON.parse(readFileSync(path, 'utf8')), login = manifest.author?.github
      return login && catalog.has(manifest.id) && !registered.has(String(login).toLowerCase()) ? [login + ' (' + path + '): add `gh api users/' + login + ' --jq .id` to .github/module-authors.json'] : []
    })
    expect(missing).toEqual([])
  })
})
