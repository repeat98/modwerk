// SPDX-License-Identifier: GPL-3.0-or-later
// A page's side of the builder: one worker, called with promises. It knows nothing about the site's pages, accounts
// or storage. `worker` starts the builder worker, for example through a bundler:
//   () => new Worker(new URL('./builder-worker.ts', import.meta.url), { type: 'module' })
import type { Added, Answer, BuildResult, Call, Check, Mod, Ready, Stock, VersionField } from './builder-protocol.ts'

export type BuilderOptions = {
  /** Where the site serves the catalog and its files (absolute, or relative to the page). */ base: string
  /** Starts the worker. */ worker: () => Worker
  /** The catalog's name beside its files; catalog.json if not given. */ catalog?: string
}

type Task = { resolve: (value: unknown) => void; reject: (error: Error) => void; log?: (line: string) => void }

export function createBuilder(options: BuilderOptions) {
  const base = new URL(options.base, globalThis.location?.href).href
  let worker: Worker | undefined, nextId = 0, closed = false, ready: Promise<Ready> | undefined
  const pending = new Map<number, Task>()

  function fail(message: string) {
    for (const task of pending.values()) task.reject(new Error(message))
    pending.clear(); worker?.terminate(); worker = undefined; ready = undefined
  }

  function startWorker(): Worker {
    const started = options.worker()
    started.onerror = () => fail('The builder stopped. Try again.')
    started.onmessage = (event: MessageEvent<Answer>) => {
      const answer = event.data, task = pending.get(answer.id)
      if (!task) return
      if ('log' in answer) { task.log?.(answer.log); return }
      pending.delete(answer.id)
      if (answer.ok) task.resolve(answer.result)
      else task.reject(new Error(answer.error))
    }
    return started
  }

  /** Any call: the bridge's (set_stock, add_mod, …) or init and add_catalog_mod. */
  function call<T>(name: string, args: Record<string, unknown> = {}, data?: ArrayBuffer, log?: (line: string) => void): Promise<T> {
    if (closed) return Promise.reject(new Error('The builder was closed.'))
    worker ??= startWorker()
    const id = ++nextId, message: Call = { id, call: name, args, data }
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, log })
      try { worker!.postMessage(message, data ? [data] : []) } catch (error) { pending.delete(id); reject(error as Error) }
    })
  }

  return {
    call,
    /** Loads the catalog and its cores, once per builder. */
    load() { return ready ??= call<Ready>('init', { base, catalog: options.catalog ?? 'catalog.json' }).catch(error => { ready = undefined; throw error }) },
    /** The owner's stock OS: recognised by its hash, or refused. Its bytes go to the worker, never the network. */
    async setStock(file: Blob & { name: string }) { return call<Stock>('set_stock', { name: file.name }, await file.arrayBuffer()) },
    /** A package the site's catalog lists, by its name there. */
    addCatalogMod(file: string) { return call<Added>('add_catalog_mod', { file }) },
    /** A package of the owner's own. */
    async addMod(file: Blob & { name: string }) { return call<Added>('add_mod', { name: file.name }, await file.arrayBuffer()) },
    removeMod(path: string) { return call<{ ok: true }>('remove_mod', { path }) },
    mods() { return call<Mod[]>('mods') },
    /** Ticks a package with what it requires: the paths ticked after. */
    tick(enabled: readonly string[], path: string) { return call<string[]>('tick', { enabled, path }) },
    check(enabled: readonly string[]) { return call<Check>('check', { enabled }) },
    /** What is wrong with a version field, if anything, and a name for the build. */
    version(version: string, enabled: readonly string[]) { return call<VersionField>('version', { version, enabled }) },
    build(enabled: readonly string[], version: string, name: string, log?: (line: string) => void) { return call<BuildResult>('build', { enabled, version, name }, undefined, log) },
    /** Stops the worker; the builder cannot be used after. */
    dispose() { closed = true; fail('The builder was closed.') },
  }
}
export type Builder = ReturnType<typeof createBuilder>
