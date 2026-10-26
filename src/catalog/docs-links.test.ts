// The guides are the context every contributor's agent reads, and agents edit them, so a link to a file or a heading
// that no longer exists, or an `npm run` command that package.json does not have, must fail the check. The module
// guides have their own, stricter test (module-guides.test.ts); this one covers every other guide a prompt points at.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

function markdownUnder(directory: string): string[] {
  const absolute = resolve(root, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute).flatMap(name => {
    const path = join(absolute, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : markdownUnder(relative(root, path))
    return /\.md$/i.test(name) ? [relative(root, path).split('\\').join('/')] : []
  })
}

/** Every guide a starter prompt, agent file or machine profile points at; octabam's own files are upstream's and stay out. */
export function guideFiles(): string[] {
  const machines = existsSync(resolve(root, 'sdk/machines')) ? readdirSync(resolve(root, 'sdk/machines')).map(name => 'sdk/machines/' + name + '/README.md') : []
  const moduleIndexes = readdirSync(resolve(root, 'sdk')).map(name => 'sdk/' + name + '/modules/README.md')
  const files = ['AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'sdk/AGENTS.md', 'sdk/README.md', '.github/pull_request_template.md', ...machines, ...moduleIndexes, ...markdownUnder('docs')]
  return [...new Set(files)].filter(file => existsSync(resolve(root, file))).sort()
}

/** GitHub's heading anchors: lower case, punctuation dropped, each space a hyphen (two spaces stay two hyphens), repeated headings numbered; plus explicit `<a name>`/`id` anchors. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>(), seen = new Map<string, number>()
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const text = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '')
    const base = text.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ /g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count ? base + '-' + count : base)
  }
  for (const [, name] of markdown.matchAll(/<(?:a|[a-z]+)\s+(?:name|id)="([^"]+)"/g)) anchors.add(name)
  return anchors
}

describe('the guides agents read', () => {
  const files = guideFiles()
  const scripts = new Set(Object.keys(JSON.parse(read('package.json')).scripts))

  it('covers the agent files, the workflow guides and every machine guide', () => {
    for (const file of ['AGENTS.md', 'sdk/AGENTS.md', 'docs/DEVELOPER_WORKFLOW.md', 'docs/ADD_A_MODULE.md', 'docs/OWNER_OPERATIONS.md', 'sdk/machines/octatrack/README.md', 'sdk/machines/digitakt-ii/README.md']) expect(files).toContain(file)
  })

  it('links only to files and headings that exist', () => {
    for (const file of files) {
      const text = read(file)
      for (const [, target] of text.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
        const [path, anchor] = target.split('#')
        const linked = resolve(root, dirname(file), path)
        expect(existsSync(linked), file + ' links to ' + target).toBe(true)
        if (anchor && /\.md$/i.test(path)) expect(headingAnchors(readFileSync(linked, 'utf8')).has(anchor), file + ' links to the heading ' + target).toBe(true)
      }
      for (const [, anchor] of text.matchAll(/\]\(#([^)\s]+)\)/g)) expect(headingAnchors(text).has(anchor), file + ' links to its own heading #' + anchor).toBe(true)
    }
  })

  it('names only npm scripts that exist', () => {
    for (const file of files) {
      for (const [, name] of read(file).matchAll(/npm run (?:--silent )?([a-z][a-z0-9:-]*)/g)) expect(scripts.has(name), file + ' names npm run ' + name).toBe(true)
    }
  })

  it('lists every document in docs/ in its index', () => {
    const index = read('docs/README.md')
    for (const name of readdirSync(resolve(root, 'docs')).filter(name => /\.md$/i.test(name) && name !== 'README.md')) expect(index, 'docs/README.md lists ' + name).toContain('](' + name + ')')
  })

  it('keeps the owner flow out of the contributor context and reachable from it', () => {
    const agents = read('AGENTS.md')
    expect(agents).not.toContain('## Finish the issue-fix flow')
    expect(agents).toContain('docs/OWNER_OPERATIONS.md')
    expect(read('docs/OWNER_OPERATIONS.md')).toContain('## Finish the issue-fix flow')
    expect(agents.split(/\s+/).length).toBeLessThan(1800)
  })
})
