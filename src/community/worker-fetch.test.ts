import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Workers runtime throws a TypeError for fetch(…, { redirect: 'error' }), so the Worker asks for 'manual' and
// checks the status (#1891). Node and browsers accept 'error', which is why the other tests never saw it.
describe('Worker fetch calls', () => {
  it("never ask for redirect: 'error'", () => {
    const root = new URL('../../', import.meta.url)
    const files = ['worker.ts', ...['server/', 'functions/'].flatMap(dir => readdirSync(new URL(dir, root), { recursive: true })
      .map(name => dir + String(name)).filter(name => name.endsWith('.ts')))]
    expect(files.filter(name => /redirect:\s*['"]error['"]/.test(readFileSync(new URL(name, root), 'utf8')))).toEqual([])
  })
})
