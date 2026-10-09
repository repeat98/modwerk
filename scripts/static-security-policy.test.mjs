import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))

async function framePolicies() {
  // Resolve the real build plugin: dev HTML has no CSP meta tag.
  const config = await resolveConfig({ root, configFile: root + 'vite.config.ts', configLoader: 'bundle' }, 'build')
  const plugin = config.plugins.find(plugin => plugin.name === 'static-security-policy')
  const hook = plugin.transformIndexHtml
  const tags = await (typeof hook === 'function' ? hook : hook.handler)('', { path: '/', filename: root + 'index.html' })
  const meta = tags.find(tag => tag.attrs?.['http-equiv'] === 'Content-Security-Policy').attrs.content
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8')
  const header = headers.split('\n').find(line => line.includes('Content-Security-Policy:')).split('Content-Security-Policy: ')[1]
  const frames = policy => policy.split(';').map(part => part.trim().split(/\s+/)).find(([directive]) => directive === 'frame-src').slice(1).sort()
  return { meta: frames(meta), header: frames(header) }
}

describe('production frame policy', () => {
  it('allows the Ko-fi dialog, YouTube player and requested SoundCloud preview in built HTML', async () => {
    const { meta } = await framePolicies()
    expect(meta).toEqual(['https://ko-fi.com', 'https://w.soundcloud.com', 'https://www.youtube-nocookie.com'])
  })

  it('uses the same restricted frame hosts in HTML and hosting headers', async () => {
    const { meta, header } = await framePolicies()
    expect(meta).toEqual(header)
  })
})
