import { expect, it } from 'vitest'
import { findLive, scriptPaths } from './site-live.mjs'

it('names the entry scripts and the chunks a script imports, in every form Vite writes them', () => {
  expect(scriptPaths('<script type="module" src="/assets/index-A1.js"></script><link href="/assets/x.css">')).toEqual(['assets/index-A1.js'])
  expect(scriptPaths('import("./Lazy-b2.js");const d=["assets/Pre-c3.js"];import{a}from"./vendor.d4.js"').sort())
    .toEqual(['assets/Lazy-b2.js', 'assets/Pre-c3.js', 'assets/vendor.d4.js'])
})

it('finds a text that only a lazily loaded chunk holds, and reports one that is nowhere', async () => {
  const site = { '': '<script src="/assets/index.js"></script>', 'assets/index.js': 'import("./Dialog.js")', 'assets/Dialog.js': 'Report the whole set' }
  const { scripts, found } = await findLive(['Report the whole set', 'not there'], 'https://example.test/', async path => site[path] ?? '')
  expect(scripts).toBe(2)
  expect(found.get('Report the whole set')).toEqual(['assets/Dialog.js'])
  expect(found.get('not there')).toEqual([])
})
