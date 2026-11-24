import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const adapters = 'sdk/machines/octatrack/module-adapters'

// Both USB Audio recipes pin the same shared sources; a header change must refresh both, not only the output-only one.
describe.each(['usb-audio-reconstruction.json', 'usb-audio-input-reconstruction.json'])('%s', recipe => {
  const { sources } = JSON.parse(readFileSync(join(root, adapters, recipe), 'utf8'))
  const files = Object.entries(sources).filter(([key]) => key.includes('/'))
  it('pins at least one repository file', () => expect(files.length).toBeGreaterThan(0))
  it.each(files)('records the current hash of %s', (path, sha256) => {
    expect(existsSync(join(root, path)), path).toBe(true)
    expect(createHash('sha256').update(readFileSync(join(root, path))).digest('hex')).toBe(sha256)
  })
})
