import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))

async function policies() {
  // Resolve the real build plugin: dev HTML has no CSP meta tag.
  const config = await resolveConfig({ root, configFile: root + 'vite.config.ts', configLoader: 'bundle' }, 'build')
  const plugin = config.plugins.find(plugin => plugin.name === 'static-security-policy')
  const hook = plugin.transformIndexHtml
  const tags = await (typeof hook === 'function' ? hook : hook.handler)('', { path: '/', filename: root + 'index.html' })
  const meta = tags.find(tag => tag.attrs?.['http-equiv'] === 'Content-Security-Policy').attrs.content
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8')
  const header = headers.split('\n').find(line => line.includes('Content-Security-Policy:')).split('Content-Security-Policy: ')[1]
  // Directive name to its sorted sources; an unset API origin leaves no empty source behind.
  const directives = policy => Object.fromEntries(policy.split(';').map(part => part.trim().split(/\s+/).filter(Boolean)).filter(part => part.length).map(([name, ...sources]) => [name, sources.sort()]))
  return { meta: directives(meta), header: directives(header) }
}

describe('production frame policy', () => {
  it('allows the Ko-fi dialog, YouTube player and requested SoundCloud preview in built HTML', async () => {
    const { meta } = await policies()
    expect(meta['frame-src']).toEqual(['https://ko-fi.com', 'https://w.soundcloud.com', 'https://www.youtube-nocookie.com'])
  })

  it('uses the same policy in HTML and hosting headers, which add only frame-ancestors', async () => {
    // Browsers enforce both policies, so any directive stricter in the headers breaks the Cloudflare fallback.
    const { meta, header } = await policies()
    const { 'frame-ancestors': ancestors, ...shared } = header
    expect(ancestors).toEqual(["'none'"])
    expect(shared).toEqual(meta)
  })
})
