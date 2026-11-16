import { Suspense, useEffect, type ReactNode } from 'react'
import { isChunkLoadError, reloadForNewRelease } from './chunk-load-error'
import { RenderBoundary } from './RenderBoundary'

/** A page that failed to render. Most often a lazy-loaded part did not arrive, because the connection dropped or a newer release replaced it while this tab stayed open. */
export function PageError({ error, scope = 'page' }: { error: unknown; scope?: 'page' | 'app' }) {
  const missing = isChunkLoadError(error)
  // Only when the whole site failed: a failed page part leaves the rest running, perhaps mid-transfer to a unit.
  useEffect(() => { if (scope === 'app' && missing) reloadForNewRelease() }, [scope, missing])
  return <div className={'no-results app-error app-error-' + scope} role="alert">
    <h1>{missing ? 'This page could not be loaded' : 'Something went wrong on this page'}</h1>
    <p>{missing ? 'A part of Modwerk did not arrive. Your connection may have dropped, or a newer version may have been released while this tab was open. ' : ''}{scope === 'page' ? 'The rest of Modwerk still works. ' : ''}Your saved configurations and firmware stay on this device.</p>
    <div className="app-error-actions">
      <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Reload page</button>
      {scope === 'page' && <a className="button button-quiet" href="#library">Open module library</a>}
    </div>
    {error instanceof Error && <details><summary>Technical details</summary><pre>{error.name + ': ' + error.message}</pre></details>}
  </div>
}

/** A lazy-loaded part of a page that is not needed to use the rest of it: if it fails, say so in its place and keep the page. */
export function LazyPanel({ name, children }: { name: string; children: ReactNode }) {
  return <RenderBoundary fallback={<p className="file-error" role="alert">{name} could not be loaded. Reload the page to try again.</p>}><Suspense fallback={null}>{children}</Suspense></RenderBoundary>
}
