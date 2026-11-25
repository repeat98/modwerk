import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, chmod, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFrontendTools } from './frontend-mcp.mjs'

// The MCP bundles the site at start. After a branch switch or a base regeneration it kept that bundle and refused the
// new base until the developer reconnected; now each tool call compares the files the bundle came from and rebuilds.
let folder, watched, service
const at = seconds => new Date(Date.UTC(2026, 10, 1, 0, 0, seconds))
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'modwerk-mcp-refresh-')); await chmod(folder, 0o700)
  watched = join(folder, 'base-versions.json')
  await writeFile(watched, '{"latest":"0.8.1"}'); await utimes(watched, at(1), at(1))
})
afterEach(async () => { await service?.close(); service = undefined; await rm(folder, { recursive: true, force: true }) })

/** A bundler that builds the site from `watched`: its documents carry the build number. */
function counting({ fail = () => false, during = async () => {} } = {}) {
  const builds = { site: 0, publication: 0 }
  const bundle = async entry => {
    if (entry.endsWith('octatrack-publication.ts')) { builds.publication++; return { module: { publishedPackages: { packages: [] } }, files: [] } }
    builds.site++
    await during(builds.site)
    if (fail(builds.site)) throw new Error('Could not resolve ../catalog/machine-modules.json')
    const build = builds.site
    return { files: [watched], module: { validateConfiguration: value => value, createRuntimeCatalogue: () => ({ ids: [] }), resolveSelection: () => {}, documents: { everb: { build } } } }
  }
  return { builds, bundle }
}
const tools = (bundle, now) => createFrontendTools({ dataDir: join(folder, 'workspace') }, undefined, { bundle, ...now ? { now } : {} })

describe('the developer MCP follows the checkout', () => {
  it('keeps its bundle while nothing it was built from changed', async () => {
    const { builds, bundle } = counting()
    service = await tools(bundle)
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 1 })
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 1 })
    expect(builds).toEqual({ site: 1, publication: 1 })
  })

  it('rebuilds the site and the package manifest after a bundled file changed (a branch switch or base regeneration)', async () => {
    const { builds, bundle } = counting()
    service = await tools(bundle)
    await writeFile(watched, '{"latest":"0.8.2"}'); await utimes(watched, at(2), at(2))
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 2 })
    expect(builds).toEqual({ site: 2, publication: 2 })
    // Board tools do not use the site bundle, so they never wait for a rebuild.
    await utimes(watched, at(3), at(3))
    await service.call('board_claims', {}).catch(() => {})
    expect(builds.site).toBe(2)
  })

  it('says why when the changed checkout does not build, and builds again on the next call', async () => {
    const { builds, bundle } = counting({ fail: build => build === 2 })
    service = await tools(bundle)
    await utimes(watched, at(2), at(2))
    await expect(service.call('site_module', { id: 'everb' })).rejects.toThrow(/checkout changed since this server bundled the site.*rebuilding failed: Could not resolve/)
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 3 })
    expect(builds.site).toBe(3)
  })

  it('builds again when a file was written while the bundle was being built', async () => {
    // A regeneration still writing its files: the first bundle may hold half of them. The clock is the test's, since file
    // times are coarser than Date.now() and the server counts a build from 2 s before it began.
    let now = at(10).getTime()
    const { builds, bundle } = counting({ during: async build => { if (build === 1) await utimes(watched, at(9), at(9)) } })
    service = await tools(bundle, () => now)
    now = at(30).getTime()
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 2 })
    expect(await service.call('site_module', { id: 'everb' })).toEqual({ build: 2 })
    expect(builds.site).toBe(2)
  })
})
