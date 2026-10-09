import { assetUrl } from './hosting'
import { moduleIdFromSlug, modulePath, moduleSlug } from './catalog/module-links'
import { profilePath, threadIdFromSegment, threadPath } from './community/forum-links'

const moduleRoute = /^module\/([a-z0-9-]+)$/
const digiModuleRoute = /^(digitakt|digitone)\/module\/([a-z0-9-]+)$/
const threadPathRoute = /^forum\/thread\/([a-zA-Z0-9-]+)\/(?:index\.html)?$/
const profilePathRoute = /^forum\/profile\/([a-z0-9_]{3,24})\/(?:index\.html)?$/
const forumRoute = /^forum\/(?:thread\/([a-zA-Z0-9-]+)|profile\/([a-z0-9_]{3,24}))$/

export function moduleHref(id: string) { return assetUrl(modulePath(id)) }
/** Thread and profile links are paths, so they can be shared, crawled and prerendered; `query` is the `?page=…&post=…` part. */
export function threadHref(id: string, title?: string | null, query = '') { return assetUrl(threadPath(id, title)) + query }
export function profileHref(username: string) { return assetUrl(profilePath(username)) }

/** The app route named by a public path. A thread or profile path carries its query in the URL search. */
function pathRoute(url: URL, appUrl: URL) {
  const path = url.pathname.slice(appUrl.pathname.length)
  const module = /^module\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(path), thread = threadPathRoute.exec(path), profile = profilePathRoute.exec(path)
  const digi = /^(digitakt|digitone)\/module\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(path)
  return /^projects\/(?:index\.html)?$/.test(path) ? 'projects' + url.search : /^submit\/(?:index\.html)?$/.test(path) ? 'submit' : digi ? digi[1] + '/module/' + digi[2] : module ? 'module/' + module[1] : thread ? 'forum/thread/' + threadIdFromSegment(thread[1]) + url.search : profile ? 'forum/profile/' + profile[1] + url.search : ''
}

/** Only app destinations participate; assets, downloads and external links keep normal browser behavior. */
export function routeFromUrl(url: URL, appUrl: URL, fallback = 'library'): string | undefined {
  if (url.origin !== appUrl.origin || !url.pathname.startsWith(appUrl.pathname)) return undefined
  const path = url.pathname.slice(appUrl.pathname.length), known = pathRoute(url, appUrl)
  if (path && path !== 'index.html' && !known) return undefined
  const route = url.hash.slice(1) || known || fallback
  const nativeRoute = route.replace(/^module\/([a-z0-9-]+)(?=\?|$)/, (_match, slug: string) => 'module/' + moduleIdFromSlug(slug))
  // The forum's account page replaced the separate activity page; old #activity links open it.
  return route === 'remixes' ? 'module-sets' : route === 'activity' ? 'account' : route.startsWith('remix/') ? 'module-set/' + route.slice(6) : nativeRoute
}

export function canonicalRouteUrl(url: URL, appUrl: URL, moduleIds: readonly string[]): URL {
  const route = routeFromUrl(url, appUrl)
  if (!route) return url
  const forumPath = /^forum\//.test(pathRoute(url, appUrl))
  // Thread, profile and project-directory paths own their search; it must not follow a hash link to another page.
  const search = forumPath || pathRoute(url, appUrl).startsWith('projects') ? '' : url.search
  const [routePath, routeQuery = ''] = route.split(/\?(.*)/s)
  const forum = forumRoute.exec(routePath)
  if (routePath === 'projects') {
    const target = new URL('projects/', appUrl), params = new URLSearchParams(search)
    for (const [key, value] of new URLSearchParams(routeQuery)) params.set(key, value)
    target.search = params.toString()
    return target
  }
  if (forum) {
    // A path, with or without the title's words, is already public; a hash link becomes the ID path.
    if (!url.hash) return url
    const target = new URL(forum[1] ? threadPath(forum[1]) : profilePath(forum[2]), appUrl), params = new URLSearchParams(search)
    for (const [key, value] of new URLSearchParams(routeQuery)) params.set(key, value)
    target.search = params.toString()
    return target
  }
  const module = moduleRoute.exec(route)
  const digi = digiModuleRoute.exec(route)
  const publicRoute = route.replace(/^module\/([a-z0-9-]+)(?=\?|$)/, (_match, id: string) => 'module/' + moduleSlug(id))
  const target = module && moduleIds.includes(module[1])
    ? new URL(modulePath(module[1]), appUrl)
    : digi ? new URL(`${digi[1]}/module/${digi[2]}/`, appUrl)
    : routePath === 'submit' && !routeQuery && url.hash ? new URL('submit/', appUrl)
    : url.hash ? new URL('#' + publicRoute, appUrl) : url
  target.search = search
  return target
}

export function getRoute(fallback = 'library') {
  const route = routeFromUrl(new URL(window.location.href), new URL(document.baseURI), fallback)
  // GitHub Pages answers unknown paths with the built 404.html, which boots the app and is marked noindex; a path that names no page is missing.
  return route ?? (document.querySelector('meta[name="robots"][content="noindex"]') ? 'page-not-found' : fallback)
}

export function startRouting(moduleIds: readonly string[]) {
  const appUrl = new URL(document.baseURI)
  // Resolve the relative build base once, so client-side navigation cannot move asset URLs.
  document.querySelector('base')?.setAttribute('href', appUrl.href)
  function canonicalize() {
    const current = new URL(window.location.href)
    const target = canonicalRouteUrl(current, appUrl, moduleIds)
    if (target.href !== current.href) window.history.replaceState(window.history.state, '', target)
  }
  function notifyRoute() { window.dispatchEvent(new Event('hashchange')) }
  canonicalize()
  window.addEventListener('hashchange', canonicalize)
  window.addEventListener('popstate', notifyRoute)
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    if (!anchor || !anchor.hasAttribute('href') || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
    const target = new URL(anchor.href)
    if (routeFromUrl(target, appUrl) === undefined) return
    event.preventDefault()
    if (target.href === window.location.href) return
    window.history.pushState(null, '', target)
    notifyRoute()
  })
}
