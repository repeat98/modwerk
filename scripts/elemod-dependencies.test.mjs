import { test, expect } from 'vitest'
import { dependencyCollections } from './elemod-dependencies.mjs'
const doc = (requires=[], releases=['1.53','1.54']) => ({ compatibility: { requires, releases } })
const build = (collections={}) => ({ requires: [], collections })
// core is never a dependency folder: the machine's core interface supplies its tables and events.
const deps = new Map([['machine-pages', { document: doc(['core']), build: build({ ev_render_voices: 4 }) }], ['dt-support', { document: doc(['core']), build: build({ dt_free_observers: 4 }) }]])
test('only required providers contribute their events and tables, transitively', () => {
 expect([...dependencyCollections(doc(['machine-pages']), build(), deps)].sort()).toEqual(['ev_render_voices'])
 expect([...dependencyCollections(doc(['dt-support']), build(), deps)].sort()).toEqual(['dt_free_observers'])
 expect([...dependencyCollections(doc(['core']), build(), deps)]).toEqual([])
 expect([...dependencyCollections(doc(), build(), deps)]).toEqual([])
 const chained = new Map(deps); chained.set('dt-support', { document: doc(['machine-pages']), build: build({ dt_free_observers: 4 }) })
 expect([...dependencyCollections(doc(['dt-support']), build(), chained)].sort()).toEqual(['dt_free_observers','ev_render_voices'])
})
test('rejects missing dependencies, missing ports and cycles', () => {
 expect(() => dependencyCollections(doc(['absent']), build(), deps)).toThrow('Missing')
 const missing = new Map(deps); missing.set('dt-support', { document: doc([], ['1.53']), build: build() })
 expect(() => dependencyCollections(doc(['dt-support']), build(), missing)).toThrow('OS port')
 const cyclic = new Map(deps); cyclic.set('machine-pages', { document: doc(['dt-support']), build: build() }); cyclic.set('dt-support', { document: doc(['machine-pages']), build: build() })
 expect(() => dependencyCollections(doc(['machine-pages']), build(), cyclic)).toThrow('cycle')
})
