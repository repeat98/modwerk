import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))

describe('npm install scripts', () => {
  it('allows exactly the locked packages that run one, so npm 11 builds them on npm ci', () => {
    const { packages } = read('package-lock.json')
    const locked = Object.entries(packages)
      .filter(([path, entry]) => path && entry.hasInstallScript)
      .map(([path, entry]) => `${path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)}@${entry.version}`)
      .sort()
    const allowed = Object.keys(read('package.json').allowScripts ?? {}).sort()
    expect(allowed, 'Update allowScripts in package.json to the versions in package-lock.json').toEqual(locked)
  })
})
