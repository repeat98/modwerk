#!/usr/bin/env node
// Is a site change live? Looks for each text in the deployed site's scripts, the lazily loaded chunks included,
// where most components live, so a string missing from the entry scripts proves nothing.
//   npm run site:live -- "Report the whole set" ["another text" …]   (SITE_URL overrides https://modwerk.app/)
import { pathToFileURL } from 'node:url'

/** The script paths a page or a chunk names: `assets/x.js`, `/assets/x.js` and a chunk's `./x.js`. */
export function scriptPaths(body) {
  const paths = new Set()
  for (const [, name] of body.matchAll(/["'`(/]((?:assets\/)?[\w.-]+\.js)(?=["'`)])/g)) paths.add('assets/' + name.replace(/^assets\//, ''))
  return [...paths]
}

export async function findLive(texts, site = 'https://modwerk.app/', get = async path => {
  const reply = await fetch(new URL(path, site), { headers: { 'User-Agent': 'modwerk-site-live' } })
  if (!reply.ok) throw new Error(path + ': HTTP ' + reply.status)
  return reply.text()
}) {
  const found = new Map(texts.map(text => [text, []])), seen = new Set(), todo = scriptPaths(await get(''))
  while (todo.length) {
    const path = todo.pop()
    if (seen.has(path)) continue
    seen.add(path)
    const body = await get(path).catch(() => '')
    for (const text of texts) if (body.includes(text)) found.get(text).push(path)
    todo.push(...scriptPaths(body).filter(next => !seen.has(next)))
  }
  return { scripts: seen.size, found }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const texts = process.argv.slice(2)
  if (!texts.length) { console.error('Usage: npm run site:live -- "text the change adds" ["another" …]'); process.exit(2) }
  const site = process.env.SITE_URL ?? 'https://modwerk.app/'
  const { scripts, found } = await findLive(texts, site)
  console.log(`${site}: read ${scripts} scripts`)
  let missing = 0
  for (const [text, paths] of found) {
    console.log((paths.length ? 'live     ' : 'NOT LIVE ') + JSON.stringify(text) + (paths.length ? ' in ' + paths.join(', ') : ''))
    if (!paths.length) missing++
  }
  process.exit(missing ? 1 : 0)
}
